/**
 * suggest-env command — scan a collection for hardcoded values and suggest (or apply)
 * environment variable replacements.
 *
 *   http-forge suggest-env --collection <ref>
 *   http-forge suggest-env --collection <ref> --apply --env dev
 *
 * All detection/apply logic lives in @http-forge/core (infrastructure/analysis/env-suggester).
 * This file is a thin CLI adapter: arg parsing + output formatting only.
 */

import {
    applyEnvSuggestionsToItems,
    createNodeContainer,
    detectEnvSuggestions,
    resolveCollectionRef,
    scanCollectionForEnvVarsWithAi,
} from '@http-forge/core';
import { createCliAiProvider } from '../ai/providers';
import { outputListResult } from '../output/format';

export async function handleSuggestEnv(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let collectionRef: string | undefined;
  let applyMode = false;
  let aiMode = false;
  let envName: string | undefined;
  let minOccurrences = 1;
  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  let outputFormat: 'json' | 'table' = 'json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--collection' || arg === '-c') && i + 1 < args.length) {
      collectionRef = args[++i];
    } else if (arg === '--apply') {
      applyMode = true;
    } else if (arg === '--ai') {
      aiMode = true;
    } else if ((arg === '--env' || arg === '--environment') && i + 1 < args.length) {
      envName = args[++i];
    } else if (arg === '--min-occurrences' && i + 1 < args.length) {
      minOccurrences = parseInt(args[++i], 10) || 1;
    } else if (arg === '--workspace' && i + 1 < args.length) {
      workspace = args[++i];
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      outputFormat = args[++i] === 'table' ? 'table' : 'json';
    }
  }

  if (!collectionRef) {
    console.error('Error: --collection <ref> is required');
    printUsage();
    process.exit(2);
  }

  const container = createNodeContainer(workspace);

  try {
    const collections = container.collection.getAllCollections();
    const { collection } = resolveCollectionRef(collections, collectionRef);

    // -- Detection (delegated to @http-forge/core) -------------------------
    let suggestions;
    if (aiMode) {
      const provider = createCliAiProvider();
      if (!provider) {
        console.error('Error: --ai requires OPENAI_API_KEY or ANTHROPIC_API_KEY to be set.');
        process.exit(1);
      }
      suggestions = await scanCollectionForEnvVarsWithAi(collection, provider);
    } else {
      suggestions = detectEnvSuggestions(collection, minOccurrences);
    }

    if (suggestions.length === 0) {
      if (outputFormat === 'json') {
        process.stdout.write(
          JSON.stringify({ suggestions: [], message: 'No hardcoded values detected.' }, null, 2) + '\n'
        );
      } else {
        console.log('No hardcoded values detected in this collection.');
      }
      return;
    }

    // -- Dry-run output ----------------------------------------------------
    if (!applyMode) {
      if (outputFormat === 'json') {
        process.stdout.write(
          JSON.stringify(
            suggestions.map((s) => ({
              varName: s.varName,
              value: s.value.length > 60 ? s.value.slice(0, 60) + '...' : s.value,
              reason: s.reason,
              occurrences: s.occurrences.length,
              locations: s.occurrences.map((o) => `${o.requestName} [${o.field}]`),
            })),
            null,
            2
          ) + '\n'
        );
      } else {
        console.log(`\nSuggested environment variables for "${collection.name}":`);
        console.log('(run with --apply --env <name> to replace values in the collection)\n');
        outputListResult(
          suggestions.map((s) => ({
            varName: `{{${s.varName}}}`,
            reason: s.reason,
            occurrences: s.occurrences.length,
            value: s.value.length > 40 ? s.value.slice(0, 40) + '...' : s.value,
          })),
          'table',
          ['varName', 'reason', 'occurrences', 'value']
        );
      }
      return;
    }

    // -- Apply mode (delegated to @http-forge/core) ------------------------
    const targetEnv = envName ?? container.environmentConfig.getSelectedEnvironment() ?? 'dev';
    const shared = container.environmentConfig.getSharedConfig();

    if (!shared) {
      console.error('Error: could not load environment configuration');
      process.exit(1);
    }

    if (!shared.environments?.[targetEnv]) {
      const names = Object.keys(shared.environments ?? {}).join(', ');
      console.error(
        `Error: environment "${targetEnv}" not found. Available: ${names || '(none)'}.\n` +
        `Create it first: http-forge env set ${targetEnv} PLACEHOLDER value`
      );
      process.exit(1);
    }

    const counts = applyEnvSuggestionsToItems(collection.items, suggestions);
    await container.collection.saveCollection(collection);

    // Write original values to the target environment
    const envVars = shared.environments[targetEnv]!;
    envVars.variables = envVars.variables ?? {};
    for (const s of suggestions) {
      envVars.variables[s.varName] = s.value;
    }
    container.environmentConfig.saveSharedConfig(shared);

    const applied = suggestions.map((s) => ({
      varName: s.varName,
      replacements: counts[s.varName] ?? 0,
      value: s.value.length > 60 ? s.value.slice(0, 60) + '...' : s.value,
    }));

    if (outputFormat === 'json') {
      process.stdout.write(
        JSON.stringify(
          {
            collection: collection.name,
            environment: targetEnv,
            applied,
            totalReplacements: Object.values(counts).reduce((a, b) => a + b, 0),
          },
          null,
          2
        ) + '\n'
      );
    } else {
      console.log(`\nApplied to collection "${collection.name}", environment "${targetEnv}":\n`);
      outputListResult(
        applied.map((a) => ({
          varName: `{{${a.varName}}}`,
          replacements: a.replacements,
          value: a.value,
        })),
        'table',
        ['varName', 'replacements', 'value']
      );
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`\n${total} replacement(s) made in ${suggestions.length} variable(s).`);
    }
  } finally {
    try { (container as any).dispose?.(); } catch { /* best-effort */ }
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge suggest-env --collection <ref> [options]

Scan a collection for hardcoded values and suggest environment variable replacements.
By default runs in dry-run mode (no files are modified).

Required:
  --collection <ref>        Collection name, slug, or id

Options:
  --apply                   Replace hardcoded values in the collection and write
                            original values to the target environment
  --env <name>              Target environment for --apply (default: active env)
  --ai                      Use AI for detection instead of heuristic rules
                            Requires OPENAI_API_KEY or ANTHROPIC_API_KEY in env
                            Override model: OPENAI_MODEL or ANTHROPIC_MODEL
  --min-occurrences <n>     Only suggest values in at least N request locations (default: 1)
                            (ignored when --ai is set; AI determines relevance)
  --workspace <path>        Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  --output json|table       Output format (default: json)
  --json                    Short for --output json
  -h, --help                Show this help

Examples:
  # Dry-run: see what would be replaced (heuristic rules)
  http-forge suggest-env --collection my-api --output table

  # Dry-run: AI-powered detection
  OPENAI_API_KEY=sk-... http-forge suggest-env --collection my-api --ai --output table

  # Apply: replace in collection, write originals to "staging" env
  http-forge suggest-env --collection my-api --apply --env staging

  # Apply with AI detection
  http-forge suggest-env --collection my-api --ai --apply --env staging

  # Only suggest values appearing in 3+ request locations
  http-forge suggest-env --collection my-api --min-occurrences 3 --output table

`);
}
