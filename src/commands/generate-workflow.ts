/**
 * generate-workflow command — scan a backend project and generate a test suite
 * whose flow-graph encodes discovered workflow chains (auth + CRUD) using
 * request/if/script nodes.
 *
 *   http-forge generate-workflow --path ./backend --collection "My API"
 *   http-forge generate-workflow --path ./backend --collection "My API" --dry-run
 *
 * All discovery/workflow logic lives in @http-forge/core.
 */

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
    discoverWorkflows,
    suiteIdFromName,
} from '@http-forge/core';

export async function handleGenerateWorkflow(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let projectPath: string | undefined;
  let collectionRef: string | undefined;
  let dryRun = false;
  let outputFormat: 'json' | 'table' = 'json';
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--path' || arg === '-p') && i + 1 < args.length) projectPath = args[++i];
    else if ((arg === '--collection' || arg === '-c') && i + 1 < args.length) collectionRef = args[++i];
    else if (arg === '--dry-run') dryRun = true;
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

    // Create a request per endpoint (unless dry-run) so suite nodes reference real ids.
    const created: Array<{ name: string; id: string }> = [];
    const endpoints = [];
    for (const ep of result.endpoints) {
      if (!dryRun) {
        const path = (ep.resolvedPath ?? ep.pathExpression).replace(/^\/+/, '');
        const params: Record<string, string> = {};
        for (const p of ep.params ?? []) {
          if (p.location === 'path') {
            params[p.name] = p.type === 'integer' ? '1' : p.type === 'number' ? '1.0' : p.example ?? 'test';
          }
        }
        const opts = {
          collectionId: col.id,
          name: ep.source?.symbolName || `${ep.method || 'GET'} ${ep.pathExpression}`,
          method: ep.method || 'GET',
          url: ep.resolvedPath ?? ep.pathExpression,
          params,
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

    const chains = discoverWorkflows(endpoints, {
      collectionId: col.id,
      collectionName: col.name,
    });

    const now = Date.now();
    const suite = {
      id: `wf_${suiteIdFromName(`Workflow ${col.name}`)}`,
      name: `Generated ${col.name} workflow suite`,
      description: 'Workflow chains generated from source-code discovery (Phase 2a L3).',
      nodes: chains.flatMap((c) => c.nodes),
      config: {
        iterations: 1,
        delayBetweenRequests: 0,
        stopOnError: false,
        readFromSharedSession: false,
        writeToSharedSession: false,
      },
      ai_generated: true,
      derived_from: endpoints.map((ep) => ep.id).filter(Boolean),
      createdAt: now,
      updatedAt: now,
    };

    if (!dryRun) {
      await container.testSuite.updateSuite(suite);
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
            chainCount: chains.length,
            chains: chains.map((c) => ({
              id: c.id,
              kind: c.kind,
              name: c.name,
              confidence: c.confidence,
              producer: c.producer,
              dependents: c.dependents,
            })),
            requestsCreated: dryRun ? undefined : created,
          },
          null,
          2
        ) + '\n'
      );
    } else {
      console.log(`\n${dryRun ? '[dry-run] ' : ''}Generated workflow suite "${suite.name}" (${chains.length} chain${chains.length !== 1 ? 's' : ''}):`);
      console.log(`  suite id: ${suite.id}`);
      console.log(`  collection: ${col.name}`);
      for (const c of chains) {
        console.log(`  - [${c.kind}] ${c.name} (${c.dependents.length} dependent${c.dependents.length !== 1 ? 's' : ''})`);
      }
      if (dryRun) {
        console.log('\n  dry-run — no requests were created. Re-run without --dry-run to persist.');
      } else {
        console.log(`\n  created ${created.length} request(s)`);
      }
    }
  } finally {
    container.dispose();
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge generate-workflow --collection <ref> [options]

Scan a backend project from source code and generate a test suite whose flow
graph encodes the discovered workflow chains (auth: token-producer -> protected
endpoints; CRUD: create -> id-scoped operations).

Options:
  --path <path>           Project root to scan (default: $HTTP_FORGE_WORKSPACE or cwd)
  --collection <ref>      Target collection (id or name; default: first collection)
  --dry-run               Preview the generated suite without creating requests or saving
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  --workspace <path>      Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  -h, --help              Show this help

Examples:
  http-forge generate-workflow --path ./backend --collection "My API" --dry-run
  http-forge generate-workflow --path ./backend --collection "My API"
`);
}
