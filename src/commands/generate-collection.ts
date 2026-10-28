/**
 * import collection command target — create an HTTP Forge collection from:
 *   --curl     a curl command string
 *   --postman  a Postman collection JSON file
 *   --openapi  an OpenAPI 3.0 spec file (JSON or YAML)
 *
 * Curl and Postman/OpenAPI import logic all live in @http-forge/core.
 * This file is a thin CLI adapter: arg parsing + output formatting only.
 */

import {
  ServiceIdentifiers,
  countRequests,
  createEnvAiProvider,
  createNodeContainer,
  enhanceCollection,
  parseCurlCommand,
  parseHar,
  ApiDiscoveryService,
  DiscoveryConfig,
  ExpressDiscoveryProvider,
  FastApiDiscoveryProvider,
  FastifyDiscoveryProvider,
  LambdaDiscoveryProvider,
  NestDiscoveryProvider,
  SpringDiscoveryProvider,
  type IOpenApiImporter,
  type UnifiedRequest,
} from '@http-forge/core';
import * as path from 'path';
import { outputResult } from '../output/format';

export async function handleGenerateCollection(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let curlCommand: string | undefined;
  let postmanFile: string | undefined;
  let openapiFile: string | undefined;
  let harFile: string | undefined;
  let collectionName: string | undefined;
  let envName: string | undefined;
  let createEnvs = false;
  let aiEnhance = false;
  let projectPath: string | undefined;
  let baseUrl = '';
  let dryRun = false;
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  let outputFormat: 'json' | 'table' = 'json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--curl' && i + 1 < args.length) {
      curlCommand = args[++i];
    } else if (arg === '--postman' && i + 1 < args.length) {
      postmanFile = args[++i];
    } else if ((arg === '--openapi' || arg === '--openapi-spec') && i + 1 < args.length) {
      openapiFile = args[++i];
    } else if (arg === '--har' && i + 1 < args.length) {
      harFile = args[++i];
    } else if (arg === '--name' && i + 1 < args.length) {
      collectionName = args[++i];
    } else if ((arg === '--env' || arg === '--environment') && i + 1 < args.length) {
      envName = args[++i];
    } else if (arg === '--create-envs') {
      createEnvs = true;
    } else if (arg === '--ai') {
      aiEnhance = true;
    } else if (arg === '--workspace' && i + 1 < args.length) {
      workspace = args[++i];
    } else if ((arg === '--path' || arg === '-p') && i + 1 < args.length) {
      projectPath = args[++i];
    } else if (arg === '--base-url' && i + 1 < args.length) {
      baseUrl = args[++i].replace(/\/+$/, '');
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      outputFormat = args[++i] === 'table' ? 'table' : 'json';
    }
  }

  const sourceCount = [curlCommand, postmanFile, openapiFile, harFile].filter(Boolean).length;
  if (sourceCount === 0) {
    console.error('Error: one of --curl, --postman, --openapi, or --har is required');
    printUsage();
    process.exit(2);
  }
  if (sourceCount > 1) {
    console.error('Error: --curl, --postman, --openapi, and --har are mutually exclusive');
    process.exit(2);
  }

  const container = createNodeContainer(workspace);

  try {
    // ── curl mode ──────────────────────────────────────────────────────────
    if (curlCommand !== undefined) {
      let parsed;
      try {
        parsed = parseCurlCommand(curlCommand);
      } catch (err) {
        console.error(`Error parsing curl command: ${(err as Error).message}`);
        process.exit(1);
      }
      if (!parsed.url) {
        console.error('Error: could not extract a URL from the curl command');
        process.exit(1);
      }

      const name = collectionName ?? `${parsed.name} Collection`;
      const collection = await container.collection.createCollection(name);

      const reqOptions: any = {
        collectionId: collection.id,
        name: parsed.name || 'Request',
        method: parsed.method,
        url: parsed.url,
      };
      if (parsed.headers.length > 0) reqOptions.headers = parsed.headers;
      if (parsed.queryParams.length > 0) reqOptions.query = parsed.queryParams;
      if (parsed.body) reqOptions.body = parsed.body;
      await container.collection.createRequest(reqOptions);

      // Write detected vars to the environment
      const addedVars: string[] = [];
      if (envName && parsed.suggestedVars.length > 0) {
        const shared = container.environmentConfig.getSharedConfig();
        const envEntry = shared?.environments?.[envName];
        if (shared && envEntry) {
          envEntry.variables = envEntry.variables ?? {};
          for (const v of parsed.suggestedVars) {
            envEntry.variables[v.key] = v.value;
            addedVars.push(v.key);
          }
          container.environmentConfig.saveSharedConfig(shared);
        } else if (shared) {
          process.stderr.write(
            `Warning: environment "${envName}" not found — detected vars not written.\n` +
            `Available: ${Object.keys(shared.environments ?? {}).join(', ') || '(none)'}\n`
          );
        }
      }

      if (aiEnhance) await runAiEnhancement(collection, container, outputFormat);

      if (outputFormat === 'table') {
        console.log(`\nCollection created: ${collection.name} (${collection.id})`);
        console.log(`Request: [${parsed.method}] ${parsed.url}`);
        if (parsed.suggestedVars.length > 0) {
          console.log('\nDetected hardcoded values:');
          for (const v of parsed.suggestedVars) {
            const trunc = v.value.length > 48 ? v.value.slice(0, 48) + '...' : v.value;
            console.log(`  {{${v.key}}}  <-  ${trunc}`);
          }
          if (addedVars.length > 0) {
            console.log(`\nWritten to environment "${envName}": ${addedVars.join(', ')}`);
          }
        }
      } else {
        outputResult({
          source: 'curl',
          collection: { id: collection.id, name: collection.name, requests: 1 },
          request: { name: parsed.name, method: parsed.method, url: parsed.url },
          detectedVars: parsed.suggestedVars.map((v) => ({ name: v.key, value: v.value })),
          ...(envName ? { writtenToEnv: envName, envVarsAdded: addedVars } : {}),
        }, 'json');
      }
    }

    // ── Postman mode ───────────────────────────────────────────────────────
    else if (postmanFile !== undefined) {
      const filePath = path.resolve(process.cwd(), postmanFile);
      const collection = await container.collection.importCollection(filePath);

      if (collectionName && collectionName !== collection.name) {
        await container.collection.renameCollection(collection.id, collectionName);
        collection.name = collectionName;
      }

      const requestCount = countRequests(collection.items);

      if (aiEnhance) await runAiEnhancement(collection, container, outputFormat);

      if (outputFormat === 'table') {
        console.log(`\nImported Postman collection: ${collection.name} (${collection.id})`);
        console.log(`Requests: ${requestCount}`);
      } else {
        outputResult({
          source: 'postman',
          collection: { id: collection.id, name: collection.name, requests: requestCount },
        }, 'json');
      }
    }

    // ── HAR mode ───────────────────────────────────────────────────────────
    else if (harFile !== undefined) {
      const filePath = path.resolve(process.cwd(), harFile);
      const fs = await import('fs');
      const raw = await fs.promises.readFile(filePath, 'utf-8');

      let collection;
      try {
        collection = parseHar(raw, { skipFailed: false }).collection;
      } catch (err) {
        console.error(`Error parsing HAR file: ${(err as Error).message}`);
        process.exit(1);
      }

      const name = collectionName ?? 'Imported from HAR';
      const created = await container.collection.createCollection(name);

      await hydrateCollection(created, collection.items, container);

      const requestCount = countRequests(created.items);

      if (aiEnhance) await runAiEnhancement(created, container, outputFormat);

      if (outputFormat === 'table') {
        console.log(`\nImported HAR archive: ${created.name} (${created.id})`);
        console.log(`Requests: ${requestCount}`);
      } else {
        outputResult({
          source: 'har',
          collection: { id: created.id, name: created.name, requests: requestCount },
        }, 'json');
      }
    }

    // ── OpenAPI mode ───────────────────────────────────────────────────────
    else if (openapiFile !== undefined) {
      const filePath = path.resolve(process.cwd(), openapiFile);
      const defaultName = path.basename(filePath).replace(/\.(json|ya?ml)$/i, '');
      const name = collectionName ?? defaultName;

      const importer = container.resolve<IOpenApiImporter>(ServiceIdentifiers.OpenApiImporter);
      const result = await importer.import(filePath, {
        collectionName: name,
        environmentName: (createEnvs || envName) ? (envName ?? name) : undefined,
      });

      const requestCount = countRequests(result.collection.items);

      if (aiEnhance) await runAiEnhancement(result.collection, container, outputFormat);

      if (outputFormat === 'table') {
        console.log(`\nImported OpenAPI spec: ${result.collection.name} (${result.collection.id})`);
        console.log(`Requests: ${requestCount}`);
        if (result.environmentCreated) {
          console.log(`Environment created: ${result.environmentCreated}`);
        }
      } else {
        outputResult({
          source: 'openapi',
          collection: { id: result.collection.id, name: result.collection.name, requests: requestCount },
          ...(result.environmentCreated ? { environmentCreated: result.environmentCreated } : {}),
        }, 'json');
      }
    }

  } finally {
    container.dispose();
    process.exit(0);
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge import collection <source> [options]

Create an HTTP Forge collection from a curl command, a Postman collection file,
an OpenAPI spec, or a HAR archive.

Sources (exactly one required):
  --curl <cmd>            curl command to parse (quote the whole string)
  --postman <file>        Postman Collection v2.x JSON file
  --openapi <file>        OpenAPI 3.0 spec file (.json, .yaml, .yml)
  --har <file>            HAR 1.2 archive file (.har)

Options:
  --name <name>           Collection name
                            curl:    default is derived from URL path
                            postman: default is name from file
                            openapi: default is filename without extension
  --env <name>            curl:    write detected variables (tokens, API keys) to this env
                          openapi: create an environment with server URLs using this name
  --environment <name>    Same as --env (long form)
  --create-envs           openapi: create environments from server URLs
                          (uses --name if --env not specified)
  --ai                    Enhance the collection with AI after import/generation
                          Reads OPENAI_API_KEY or ANTHROPIC_API_KEY from env
                          Override model via OPENAI_MODEL or ANTHROPIC_MODEL
                          Force provider: HTTP_FORGE_AI_PROVIDER=openai|anthropic
  --workspace <path>      Workspace folder (default: \$HTTP_FORGE_WORKSPACE or cwd)
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  -h, --help              Show this help

Examples:
  # From curl
  http-forge import collection --curl "curl https://api.example.com/users"
  http-forge import collection --curl "curl -X POST https://api.example.com/v1/users \
    -H 'Authorization: Bearer sk-abc123' -d '{\\"name\\":\\"Alice\\"}'" --env dev

  # From Postman collection export
  http-forge import collection --postman ./MyCollection.postman_collection.json

  # From Postman — with AI enhancement
  http-forge import collection --postman ./MyCollection.postman_collection.json --ai

  # From OpenAPI spec, creating an environment from server URLs
  http-forge import collection --openapi ./openapi.yaml --name "Payments API" --create-envs --env staging --ai

  # From a HAR archive (browser/network capture)
  http-forge import collection --har ./capture.har --name "Session Traces"

  # From discovered backend endpoints (requests only, no suite)
  http-forge generate-collection --from-discovery --path ./backend --collection "My API" --base-url https://api.example.com

`);
}

// ─── AI helper ────────────────────────────────────────────────────────────────
async function runAiEnhancement(
  collection: import('@http-forge/core').Collection,
  container: ReturnType<typeof import('@http-forge/core').createNodeContainer>,
  outputFormat: 'json' | 'table'
): Promise<void> {
  const provider = createEnvAiProvider();
  if (!provider) {
    process.stderr.write(
      'Warning: --ai requires OPENAI_API_KEY or ANTHROPIC_API_KEY in the environment.\n'
    );
    return;
  }
  if (outputFormat === 'table') process.stderr.write('Enhancing collection with AI...\n');
  await enhanceCollection(collection, container.collection, provider, (msg) => {
    if (outputFormat === 'table') process.stderr.write(`  ${msg}\n`);
  });
  if (outputFormat === 'table') process.stderr.write('AI enhancement complete.\n');
}

// ─── HAR helper ───────────────────────────────────────────────────────────────

/**
 * Recreate a parsed HAR collection (folders by hostname + requests) using the
 * collection service so it gets persisted and id-tracked like any other import.
 */
async function hydrateCollection(
  collection: import('@http-forge/core').Collection,
  items: Array<import('@http-forge/core').UnifiedFolder | UnifiedRequest>,
  container: ReturnType<typeof import('@http-forge/core').createNodeContainer>
): Promise<void> {
  for (const item of items) {
    if (item.type === 'folder') {
      const folder = await container.collection.createFolder({
        collectionId: collection.id,
        name: item.name,
      });
      for (const child of item.items ?? []) {
        if (child.type === 'request') {
          await createHarRequest(container, collection.id, folder.id, child);
        }
      }
    } else if (item.type === 'request') {
      await createHarRequest(container, collection.id, undefined, item);
    }
  }
}

async function createHarRequest(
  container: ReturnType<typeof import('@http-forge/core').createNodeContainer>,
  collectionId: string,
  parentId: string | undefined,
  req: UnifiedRequest
): Promise<void> {
  const options: any = {
    collectionId,
    parentId,
    name: req.name,
    method: req.method,
    url: req.url,
  };
  if (req.headers?.length) options.headers = req.headers;
  if (req.query?.length) options.query = req.query;
  if (req.body) options.body = req.body;
  await container.collection.createRequest(options);
}

export async function handleGenerateCollectionFromDiscovery(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }
  let collectionName: string | undefined;
  let projectPath: string | undefined;
  let baseUrl = '';
  let dryRun = false;
  let outputFormat: 'json' | 'table' = 'json';
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--collection' || arg === '-c') && i + 1 < args.length) collectionName = args[++i];
    else if ((arg === '--path' || arg === '-p') && i + 1 < args.length) projectPath = args[++i];
    else if (arg === '--base-url' && i + 1 < args.length) baseUrl = args[++i].replace(/\/+$/, '');
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
    else if (arg === '--workspace' && i + 1 < args.length) workspace = args[++i];
  }

  const container = createNodeContainer(workspace);
  try {
          const collections = container.collection.getAllCollections();
          const col = collectionName
            ? collections.find((c) => c.id === collectionName || c.name === collectionName)
            : collections[0];
          if (!col) {
            console.error(collectionName
              ? `Error: collection "${collectionName}" not found.`
              : 'Error: no collection found (create one first).');
            process.exit(2);
          }

          const root = projectPath ?? workspace;
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

          const created: Array<{ name: string; id: string }> = [];
          for (const ep of result.endpoints) {
            if (!dryRun) {
              const pth = (ep.resolvedPath ?? ep.pathExpression).replace(/^\/+/, '');
              const url = baseUrl ? `${baseUrl}/${pth}` : (ep.resolvedPath ?? ep.pathExpression);
              const headers = (ep.params ?? [])
                .filter((pp) => pp.location === 'header')
                .map((pp) => ({ key: pp.name, value: pp.example ?? '', enabled: true }));
              const query = (ep.params ?? [])
                .filter((pp) => pp.location === 'query')
                .map((pp) => ({ key: pp.name, value: pp.example ?? '', enabled: true }));
              const params: Record<string, string> = {};
              for (const pp of ep.params ?? []) {
                if (pp.location === 'path') {
                  params[pp.name] = pp.type === 'integer' ? '1' : pp.type === 'number' ? '1.0' : pp.example ?? 'test';
                }
              }
              if (ep.auth?.type === 'jwt' || ep.auth?.type === 'bearer') {
                headers.push({ key: 'Authorization', value: 'Bearer {{TOKEN}}', enabled: true });
              }
              const req = await container.collection.createRequest({
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
              });
              created.push({ name: req.name, id: req.id });
            }
          }

          if (!dryRun) {
            await container.collection.saveCollection(col);
          }

          if (outputFormat === 'json') {
            process.stdout.write(JSON.stringify({
              collection: col.name,
              dryRun,
              endpointCount: result.endpoints.length,
              requestsCreated: dryRun ? undefined : created,
            }, null, 2) + '\n');
          } else {
            console.log(`\n${dryRun ? '[dry-run] ' : ''}Created ${dryRun ? 0 : created.length} request(s) in collection "${col.name}" from ${result.endpoints.length} discovered endpoint(s).`);
            if (dryRun) {
              console.log('  dry-run — no requests were created. Re-run without --dry-run to persist.');
            }
          }

  } finally {
    container.dispose();
    process.exit(0);
  }
}
