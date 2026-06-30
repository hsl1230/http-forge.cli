/**
 * generate-collection command — create an HTTP Forge collection from:
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
    createNodeContainer,
    enhanceCollection,
    parseCurlCommand,
    type IOpenApiImporter,
} from '@http-forge/core';
import * as path from 'path';
import { createCliAiProvider } from '../ai/providers';
import { outputResult } from '../output/format';

export async function handleGenerateCollection(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let curlCommand: string | undefined;
  let postmanFile: string | undefined;
  let openapiFile: string | undefined;
  let collectionName: string | undefined;
  let envName: string | undefined;
  let createEnvs = false;
  let aiEnhance = false;
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
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      outputFormat = args[++i] === 'table' ? 'table' : 'json';
    }
  }

  const sourceCount = [curlCommand, postmanFile, openapiFile].filter(Boolean).length;
  if (sourceCount === 0) {
    console.error('Error: one of --curl, --postman, or --openapi is required');
    printUsage();
    process.exit(2);
  }
  if (sourceCount > 1) {
    console.error('Error: --curl, --postman, and --openapi are mutually exclusive');
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
    try { (container as any).dispose?.(); } catch { /* best-effort */ }
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge generate-collection <source> [options]

Create an HTTP Forge collection from a curl command, a Postman collection file,
or an OpenAPI spec.

Sources (exactly one required):
  --curl <cmd>            curl command to parse (quote the whole string)
  --postman <file>        Postman Collection v2.x JSON file
  --openapi <file>        OpenAPI 3.0 spec file (.json, .yaml, .yml)

Options:
  --name <name>           Collection name
                            curl:    default is derived from URL path
                            postman: default is name from file
                            openapi: default is filename without extension
  --env <name>            curl:    write detected variables (tokens, API keys) to this env
                          openapi: create an environment with server URLs using this name
  --create-envs           openapi: create environments from server URLs
                          (uses --name if --env not specified)  --ai                    Enhance the collection with AI after import/generation
                          Reads OPENAI_API_KEY or ANTHROPIC_API_KEY from env
                          Override model via OPENAI_MODEL or ANTHROPIC_MODEL
                          Force provider: HTTP_FORGE_AI_PROVIDER=openai|anthropic  --workspace <path>      Workspace folder (default: \$HTTP_FORGE_WORKSPACE or cwd)
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  -h, --help              Show this help

Examples:
  # From curl
  http-forge generate-collection --curl "curl https://api.example.com/users"
  http-forge generate-collection --curl "curl -X POST https://api.example.com/v1/users \\
    -H 'Authorization: Bearer sk-abc123' -d '{\\"name\\":\\"Alice\\"}'" --env dev

  # From Postman collection export
  http-forge generate-collection --postman ./MyCollection.postman_collection.json

  # From Postman — with AI enhancement
  http-forge generate-collection --postman ./MyCollection.postman_collection.json --ai

  # From OpenAPI spec, creating an environment from server URLs
  http-forge generate-collection --openapi ./openapi.yaml --name "Payments API" --create-envs --env staging --ai

`);
}

// ─── AI helper ────────────────────────────────────────────────────────────────

async function runAiEnhancement(
  collection: import('@http-forge/core').Collection,
  container: ReturnType<typeof import('@http-forge/core').createNodeContainer>,
  outputFormat: 'json' | 'table'
): Promise<void> {
  const provider = createCliAiProvider();
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
