/**
 * architect command — design a complete API from a natural-language intent
 * (Phase 4 / Layer 8). One flow: intent → designed OpenAPI spec → collection →
 * test suite + flow + workflow chains + docs + round-trip OpenAPI export.
 *
 *   http-forge architect "I need a shopping cart"
 *   http-forge architect "a todo list" --name "Todo API" --base-url https://api.todo.dev --apply
 *
 * By default only the collection is persisted (the design artifact). The
 * generated suite / flow / docs / OpenAPI are printed for review; pass
 * `--apply` to also persist the suite and write the byproduct files. All
 * artifacts are tagged ai_generated:true (the Phase 2b drift hook).
 *
 * All design/generation logic lives in @http-forge/core. This file is a thin
 * CLI adapter: arg parsing + output formatting only.
 */

import {
  ApiArchitectService,
  OpenApiExporter,
  OpenApiImporter,
  SchemaInferenceService,
  createEnvAiProvider,
  createNodeContainer,
} from '@http-forge/core';

export async function handleArchitect(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  const intent = args.filter((a) => !a.startsWith('--'))[0] ?? args[0];
  if (!intent || intent.startsWith('--')) {
    console.error('Error: missing intent (e.g. http-forge architect "I need a shopping cart").');
    process.exit(2);
  }

  let collectionName: string | undefined;
  let baseUrl: string | undefined;
  let environmentName: string | undefined;
  let apply = false;
  let flowOut: string | undefined;
  let docsOut: string | undefined;
  let openapiOut: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--name' || arg === '-n') && i + 1 < args.length) collectionName = args[++i];
    else if (arg === '--base-url' && i + 1 < args.length) baseUrl = args[++i].replace(/\/+$/, '');
    else if ((arg === '--env' || arg === '-e') && i + 1 < args.length) environmentName = args[++i];
    else if (arg === '--apply') apply = true;
    else if (arg === '--flow-out' && i + 1 < args.length) flowOut = args[++i];
    else if (arg === '--docs-out' && i + 1 < args.length) docsOut = args[++i];
    else if (arg === '--openapi-out' && i + 1 < args.length) openapiOut = args[++i];
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
    else if (arg === '--workspace' && i + 1 < args.length) workspace = args[++i];
  }

  const provider = createEnvAiProvider();
  if (!provider) {
    console.error(
      'Error: the architect needs an AI provider. Set OPENAI_API_KEY or ANTHROPIC_API_KEY (and optionally HTTP_FORGE_AI_PROVIDER).'
    );
    process.exit(2);
  }

  const container = createNodeContainer(workspace);
  try {
    const architect = new ApiArchitectService(
      new OpenApiImporter(container.collection, container.environmentConfig),
      new OpenApiExporter(
        container.collection,
        container.environmentConfig,
        new SchemaInferenceService(
          {} as any,
          {} as any,
          {} as any
        )
      ),
      provider
    );

    if (outputFormat === 'table') process.stderr.write('Designing API from intent...\n');
    const result = await architect.designFromIntent(intent, {
      collectionName,
      baseUrl,
      environmentName,
      workspaceFolder: workspace,
    });

    if (apply) {
      await container.testSuite.updateSuite(result.suite);

      const fs = require('fs');
      const path = require('path');
      const mkdir = (file: string) => fs.mkdirSync(path.dirname(file), { recursive: true });
      if (flowOut) {
        mkdir(flowOut);
        fs.writeFileSync(flowOut, result.flow, 'utf-8');
      }
      if (docsOut) {
        mkdir(docsOut);
        fs.writeFileSync(docsOut, result.docs, 'utf-8');
      }
      if (openapiOut) {
        mkdir(openapiOut);
        fs.writeFileSync(openapiOut, result.openapi, 'utf-8');
      }
    }

    if (outputFormat === 'json') {
      process.stdout.write(
        JSON.stringify(
          {
            intent: result.intent,
            collection: { id: result.collectionId, name: result.collectionName },
            environmentCreated: result.environmentCreated,
            aiGenerated: result.ai_generated,
            endpointCount: result.endpoints.length,
            suite: { id: result.suite.id, name: result.suite.name, nodeCount: result.suite.nodes.length },
            flow: result.flow,
            workflowChains: result.workflows.map((c) => ({
              id: c.id,
              kind: c.kind,
              name: c.name,
              producer: c.producer,
              dependents: c.dependents,
            })),
            openapi: result.openapi,
            docs: result.docs,
            applied: apply,
          },
          null,
          2
        ) + '\n'
      );
    } else {
      console.log(`\nDesigned API "${result.collectionName}" (${result.endpoints.length} endpoints):`);
      console.log(`  collection: ${result.collectionId}`);
      if (result.environmentCreated) console.log(`  environment: ${result.environmentCreated}`);
      console.log(`  ai_generated: ${result.ai_generated}`);
      console.log('');
      for (const ep of result.endpoints) {
        const auth = ep.auth?.required ? ' (auth)' : '';
        console.log(`  ${ep.method.toUpperCase().padEnd(6)} ${ep.pathExpression}${auth}`);
      }
      if (result.workflows.length > 0) {
        console.log('');
        console.log(`Workflow chains (${result.workflows.length}):`);
        for (const chain of result.workflows) {
          console.log(`  - [${chain.kind}] ${chain.name} (${chain.dependents.length} dependent${chain.dependents.length !== 1 ? 's' : ''})`);
        }
      }
      console.log('');
      console.log(`  suite: ${result.suite.name} (${result.suite.nodes.length} nodes) — ${result.suite.id}`);
      if (apply) {
        console.log(`  applied: suite saved to ${workspace}/.http-forge/suites/`);
        if (flowOut) console.log(`  flow written to: ${flowOut}`);
        if (docsOut) console.log(`  docs written to: ${docsOut}`);
        if (openapiOut) console.log(`  openapi written to: ${openapiOut}`);
      } else {
        console.log('  dry-run of the reviewable package — re-run with --apply to persist the suite and byproducts.');
      }
    }
  } finally {
    container.dispose();
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge architect "<intent>" [options]

Design a complete REST API from a natural-language intent (Phase 4 / Layer 8):
intent → designed OpenAPI spec → collection → test suite + flow + workflow
chains + docs + round-trip OpenAPI export. All artifacts are tagged
ai_generated:true.

Options:
  --name <name>           Collection/API name (default: from the designed spec)
  --base-url <url>        Base URL for the designed API (default: http://localhost:3000)
  --env <name>            Environment name to create with the server URL (optional)
  --apply                 Persist the generated suite and write byproduct files
  --flow-out <path>       Write the generated .flow.js artifact (requires --apply)
  --docs-out <path>       Write the generated markdown docs (requires --apply)
  --openapi-out <path>    Write the round-trip OpenAPI document (requires --apply)
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  --workspace <path>      Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  -h, --help              Show this help

Examples:
  http-forge architect "I need a shopping cart"
  http-forge architect "a todo list" --name "Todo API" --base-url https://api.todo.dev
  http-forge architect "team chat with auth" --apply --flow-out ./todo.flow.js --docs-out ./todo.md --openapi-out ./todo.openapi.json
`);
}
