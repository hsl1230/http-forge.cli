/**
 * qa command — one-shot API quality gate.
 *
 *   http-forge qa --path ./backend --collection "My API" --base-url http://localhost:3000
 *   http-forge qa --path ./backend --collection "My API" --base-url http://localhost:3000 --dry-run
 *
 * Discover → generate → run → report, reusing the @http-forge/core QA service.
 * Exit codes: 0 pass/dry-run, 1 assertion failures, 2 infra error, 3 drift
 * (with --fail-on-drift). This file is a thin CLI adapter: arg parsing,
 * output formatting, and exit codes only.
 */

import {
    createEnvAiProvider,
    createNodeContainer,
    renderQaReportTable,
    runQaCheck,
    type QaCheckReport,
} from '@http-forge/core';

export async function handleQa(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let projectPath: string | undefined;
  let collectionRef: string | undefined;
  let baseUrl = '';
  let environment: string | undefined;
  let variables: Record<string, unknown> | undefined;
  let framework: string | undefined;
  let dryRun = false;
  let aiAssertions = false;
  let assertBodySchema = false;
  let failOnDrift = false;
  let storedGitHash: string | undefined;
  let storedScannedAt: string | undefined;
  let reportOut: string | undefined;
  let outputFormat: 'json' | 'table' = 'table';
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--path' || arg === '-p') && i + 1 < args.length) projectPath = args[++i];
    else if ((arg === '--collection' || arg === '-c') && i + 1 < args.length) collectionRef = args[++i];
    else if (arg === '--base-url' && i + 1 < args.length) baseUrl = args[++i].replace(/\/+$/, '');
    else if ((arg === '--env' || arg === '--environment') && i + 1 < args.length) environment = args[++i];
    else if (arg === '--variables' && i + 1 < args.length) {
      try {
        const parsed: unknown = JSON.parse(args[++i]);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('must be a JSON object');
        }
        variables = parsed as Record<string, unknown>;
      } catch (error) {
        console.error(`Error: --variables must be a JSON object: ${(error as Error).message}`);
        process.exit(2);
      }
    }
    else if ((arg === '--framework' || arg === '-f') && i + 1 < args.length) framework = args[++i];
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--ai-assertions') aiAssertions = true;
    else if (arg === '--assert-body-schema') assertBodySchema = true;
    else if (arg === '--fail-on-drift') failOnDrift = true;
    else if (arg === '--stored-git-hash' && i + 1 < args.length) storedGitHash = args[++i];
    else if (arg === '--stored-scanned-at' && i + 1 < args.length) storedScannedAt = args[++i];
    else if (arg === '--report' && i + 1 < args.length) reportOut = args[++i];
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
    else if (arg === '--workspace' && i + 1 < args.length) workspace = args[++i];
  }

  const root = projectPath ?? workspace;
  const container = createNodeContainer(workspace);
  try {
    let aiProvider;
    if (aiAssertions) {
      aiProvider = createEnvAiProvider();
      if (!aiProvider) {
        console.error('Warning: --ai-assertions requested but no AI provider is configured (OPENAI_API_KEY / ANTHROPIC_API_KEY); continuing with deterministic assertions only.');
      }
    }

    let report: QaCheckReport;
    try {
      if (!collectionRef) {
        const all = container.collection.getAllCollections();
        if (all.length === 0) {
          console.error('Error: no collection found (create one first).');
          process.exit(2);
        }
        collectionRef = all[0].id;
      }
      report = await runQaCheck(
        { collection: container.collection, testSuite: container.testSuite, config: container.config },
        workspace,
        {
          projectPath: root,
          collectionRef,
          baseUrl: baseUrl || undefined,
          environment,
          variables,
          framework,
          dryRun,
          failOnDrift,
          storedGitHash,
          storedScannedAt,
          assertBodySchema,
          aiAssertions,
          aiProvider: aiProvider ?? undefined,
        }
      );
    } catch (error) {
      // Infra errors: undiscoverable project, unknown collection/framework,
      // missing base-url. Never reported as test failures.
      console.error(`Error: ${(error as Error).message}`);
      process.exit(2);
    }

    if (reportOut) {
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(path.dirname(reportOut), { recursive: true });
      fs.writeFileSync(reportOut, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    }

    if (outputFormat === 'json') {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      console.log(renderQaReportTable(report));
      if (report.aiAssertions.requested && report.aiAssertions.note) {
        console.log(`\n  note: ${report.aiAssertions.note}`);
      }
    }

    if (report.status === 'fail') process.exit(1);
    if (report.status === 'drift') process.exit(3);
  } finally {
    container.dispose();
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge qa --collection <ref> [options]

One-shot API quality gate: discover endpoints from backend source code,
generate (or reuse) requests in the target collection, run the deterministic
QA suite against a live server, and report per-endpoint results.

Options:
  --path <path>           Project root to scan (default: $HTTP_FORGE_WORKSPACE or cwd)
  --collection <ref>      Target collection (id, slug, or name; default: first collection)
  --base-url <url>        Running server to execute against (required unless --dry-run)
  --env, --environment <n> Environment for variable resolution (default: selected)
  --variables <json>      Extra variables as a JSON object (e.g. '{"TOKEN":"abc"}')
  --framework <name>      Restrict discovery (express, nestjs, fastify, lambda,
                          spring, fastapi; default: all)
  --dry-run               Preview the plan without creating requests or running
  --ai-assertions         Propose LLM-written assertions after the run (needs
                          OPENAI_API_KEY or ANTHROPIC_API_KEY; advisory only)
  --assert-body-schema    Also assert JSON array response bodies
  --fail-on-drift         Exit 3 when the project moved since the stored scan
  --stored-git-hash <sha> Git HEAD from a prior scan (enables git-based drift)
  --stored-scanned-at <iso> Scan time from a prior scan (mtime-based drift)
  --report <path>         Write the full JSON report to this file
  --output json|table     Stdout format (default: table)
  --json                  Short for --output json
  --workspace <path>      Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  -h, --help              Show this help

Exit codes: 0 pass/dry-run, 1 assertion failures, 2 infra error, 3 drift.

Examples:
  http-forge qa --path ./backend --collection "My API" --base-url http://localhost:3000 --dry-run
  http-forge qa --path ./backend --collection "My API" --base-url http://localhost:3000 --env staging --report ./qa-report.json
`);
}
