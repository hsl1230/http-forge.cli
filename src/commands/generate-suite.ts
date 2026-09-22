/**
 * generate-suite command — scan a backend project and generate a runnable test
 * suite (`.suite.json`) from the discovered endpoints, creating the underlying
 * requests in a target collection.
 *
 *   http-forge generate-suite --path ./backend --collection "My API"
 *   http-forge generate-suite --path ./backend --collection "My API" --base-url https://api.example.com
 *   http-forge generate-suite --path ./backend --collection "My API" --dry-run
 *
 * All discovery/generation logic lives in @http-forge/core. This file is a thin
 * CLI adapter: arg parsing + output formatting only.
 */

import type { KeyValueEntry } from '@http-forge/core';
import {
    ApiDiscoveryService,
    DiscoveryConfig,
    ExpressDiscoveryProvider,
    FastApiDiscoveryProvider,
    FastifyDiscoveryProvider,
    LambdaDiscoveryProvider,
    NestDiscoveryProvider,
    SpringDiscoveryProvider,
    createNodeContainer,
    generateFlowFromEndpoints,
    generateSuiteFromEndpoints,
    runSuite,
} from '@http-forge/core';

export async function handleGenerateSuite(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let projectPath: string | undefined;
  let collectionRef: string | undefined;
  let baseUrl = '';
  let dryRun = false;
  let assertBodySchema = false;
  let runAfter = false;
  let flowOut: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--path' || arg === '-p') && i + 1 < args.length) projectPath = args[++i];
    else if ((arg === '--collection' || arg === '-c') && i + 1 < args.length) collectionRef = args[++i];
    else if (arg === '--base-url' && i + 1 < args.length) baseUrl = args[++i].replace(/\/+$/, '');
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--assert-body-schema') assertBodySchema = true;
    else if (arg === '--run') runAfter = true;
    else if (arg === '--flow-out' && i + 1 < args.length) flowOut = args[++i];
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
    else if (arg === '--workspace' && i + 1 < args.length) workspace = args[++i];
  }

  const root = projectPath ?? workspace;

  const container = createNodeContainer(workspace);
  try {
    const collections = container.collection.getAllCollections();
    const col = collectionRef
      ? collections.find((c) => c.id === collectionRef || c.name === collectionRef)
      : collections[0];
    if (!col) {
      console.error(collectionRef
        ? `Error: collection "${collectionRef}" not found.`
        : 'Error: no collection found (create one first).');
      process.exit(2);
    }

    const service = new ApiDiscoveryService({
      providers: [
        new ExpressDiscoveryProvider(),
        new NestDiscoveryProvider(),
        new FastifyDiscoveryProvider(),
        new LambdaDiscoveryProvider(),
        new SpringDiscoveryProvider(),
        new FastApiDiscoveryProvider(),
      ],
    });
    const discoveryConfig: DiscoveryConfig = container.config.getDiscoveryConfig();

    const result = await service.discover({ workspaceFolder: root, ...discoveryConfig });
    if (result.endpoints.length === 0) {
      console.log(`No endpoints discovered in ${root}.`);
      return;
    }

    // Create a request per endpoint in the collection (unless dry-run), so the
    // suite nodes reference real requestIds.
    const created: Array<{ name: string; id: string }> = [];
    const endpoints = [];
    for (const ep of result.endpoints) {
      if (!dryRun) {
        const path = (ep.resolvedPath ?? ep.pathExpression).replace(/^\/+/, '');
        const url = baseUrl ? `${baseUrl}/${path}` : (ep.resolvedPath ?? ep.pathExpression);
        const headers: KeyValueEntry[] = (ep.params ?? [])
          .filter((p) => p.location === 'header')
          .map((p) => ({ key: p.name, value: p.example ?? '', enabled: true }));
        const query: KeyValueEntry[] = (ep.params ?? [])
          .filter((p) => p.location === 'query')
          .map((p) => ({ key: p.name, value: p.example ?? '', enabled: true }));
        const params: Record<string, string> = {};
        for (const p of ep.params ?? []) {
          if (p.location === 'path') {
            params[p.name] = p.type === 'integer' ? '1' : p.type === 'number' ? '1.0' : p.example ?? 'test';
          }
        }
        if (ep.auth?.type === 'jwt' || ep.auth?.type === 'bearer') {
          headers.push({ key: 'Authorization', value: 'Bearer {{TOKEN}}', enabled: true });
        }
        const opts = {
          collectionId: col.id,
          name: ep.source?.symbolName || `${ep.method || 'GET'} ${ep.pathExpression}`,
          method: ep.method || 'GET',
          url,
          headers,
          query,
          params,
          body: ep.requestBody?.type === 'json'
            ? { type: 'raw' as const, format: 'json' as const, content: '{}' }
            : undefined,
          description: `Discovered from ${ep.source?.filePath} (${ep.framework}, ${ep.confidence}).`,
        };
        const req = await container.collection.createRequest(opts);
        created.push({ name: req.name, id: req.id });
        endpoints.push({ ...ep, id: req.id });
      } else {
        endpoints.push(ep);
      }
    }

    if (!dryRun) {
      await container.collection.saveCollection(col);
    }

    const { suite, derived } = generateSuiteFromEndpoints(endpoints, {
      collectionId: col.id,
      collectionName: col.name,
      name: `Generated ${col.name} suite`,
      assertBodySchema,
    });

    const flowSource = generateFlowFromEndpoints(endpoints, {
      requestPathOf: (ep) => ep.source?.symbolName || `${ep.method || 'GET'} ${ep.pathExpression}`,
      name: `${suite.name} flow`,
    });

    if (flowOut) {
      const fs = require('fs');
      fs.mkdirSync(require('path').dirname(flowOut), { recursive: true });
      fs.writeFileSync(flowOut, flowSource, 'utf-8');
    }

    if (!dryRun) {
      await container.testSuite.updateSuite(suite);
    }

    // ── Phase 2 loop: generate → run against the live server ─────────────
    let runResult: unknown;
    if (runAfter && !dryRun) {
      console.log(`\nRunning suite "${suite.name}" against the configured environment...\n`);
      runResult = await runSuite({ workspaceFolder: workspace, suiteId: suite.id });
    }

    if (outputFormat === 'json') {
      process.stdout.write(
        JSON.stringify(
          {
            suite: suite.id,
            name: suite.name,
            collection: col.name,
            dryRun,
            aiGenerated: suite.ai_generated,
            derived,
            endpointCount: suite.nodes.length,
            requestsCreated: dryRun ? undefined : created,
            flowSource,
            run: runAfter && !dryRun ? runResult : undefined,
          },
          null,
          2
        ) + '\n'
      );
    } else {
      console.log(`\n${dryRun ? '[dry-run] ' : ''}Generated suite "${suite.name}" (${suite.nodes.length} endpoint${suite.nodes.length !== 1 ? 's' : ''}):`);
      console.log(`  suite id: ${suite.id}`);
      console.log(`  collection: ${col.name}`);
      console.log(`  ai_generated: ${suite.ai_generated}`);
      console.log('');
      if (dryRun) {
        console.log('  dry-run — no requests were created. Re-run without --dry-run to persist.');
      } else {
        console.log(`  created ${created.length} request(s)`);
      }
      console.log(`  saved to: ${workspace}/.http-forge/suites/`);
      if (runAfter) {
        const summary = (runResult as { summary?: { passed?: number; failed?: number; total?: number } })?.summary;
        if (summary) {
          console.log(`\n  run result: ${summary.passed}/${summary.total} passed${summary.failed ? `, ${summary.failed} failed` : ''}`);
        }
      }
    }
  } finally {
    container.dispose();
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge generate-suite --collection <ref> [options]

Scan a backend project from source code and generate a runnable test suite
(.suite.json) from the discovered endpoints. Requests are created in the target
collection first; generated suites are tagged ai_generated:true.

Options:
  --path <path>           Project root to scan (default: $HTTP_FORGE_WORKSPACE or cwd)
  --collection <ref>      Target collection (id or name; default: first collection)
  --base-url <url>        Base URL to prefix discovered paths (e.g. https://api.example.com)
  --dry-run               Preview the generated suite without creating requests or saving
  --assert-body-schema    Also assert JSON array response bodies
  --run                   Execute the generated suite against the configured environment after saving
  --flow-out <path>       Write the generated .flow.js artifact to this file
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  --workspace <path>      Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  -h, --help              Show this help

Examples:
  http-forge generate-suite --path ./backend --collection "My API" --dry-run
  http-forge generate-suite --path ./backend --collection "My API" --base-url https://api.example.com
`);
}
