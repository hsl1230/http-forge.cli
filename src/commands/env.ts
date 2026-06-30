/**
 * Env command — read and write environment variables in the workspace config.
 *
 *   http-forge env list
 *   http-forge env get <name> [--output table] [--no-values]
 *   http-forge env set <env> <key> <value>
 *   http-forge env set <env> <key>=<value>
 *   http-forge env unset <env> <key>
 *   http-forge env select <name>
 *
 * All subcommands support --workspace and --json / --output.
 */

import { createNodeContainer } from '@http-forge/core';
import { outputListResult } from '../output/format';

export async function handleEnv(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`
Usage: http-forge env <subcommand> [options]

Subcommands:
  list                  List all environments (name, active, variable count)
  get <name>            Show all variables for an environment
  set <env> <key> <val> Write a variable permanently to the env JSON file
  unset <env> <key>     Remove a variable from the env JSON file

Options:
  --workspace <path>    Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  --output json|table   Output format for list/get (default: json)
  --json                Short for --output json
  --no-values           Omit variable values in 'get' (shows only keys)
`);
    return;
  }

  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  let outputFormat: 'json' | 'table' = 'json';
  let showValues = true;

  const positionals: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--workspace' && i + 1 < args.length) {
      workspace = args[++i];
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      outputFormat = args[++i] === 'table' ? 'table' : 'json';
    } else if (arg === '--no-values') {
      showValues = false;
    } else if (!arg.startsWith('--')) {
      positionals.push(arg);
    }
  }

  const container = createNodeContainer(workspace);

  try {
    if (subcommand === 'list') {
      const envs = container.environmentConfig.getAllEnvironments();
      const result = envs.map((e) => ({
        name: e.name,
        active: e.active,
        variableCount: Object.keys(e.variables ?? {}).length,
      }));
      outputListResult(result, outputFormat, ['name', 'active', 'variableCount']);

    } else if (subcommand === 'get') {
      const envName = positionals[0];
      if (!envName) {
        console.error('Error: environment name is required — e.g. http-forge env get staging');
        process.exit(2);
      }
      const envs = container.environmentConfig.getAllEnvironments();
      const env = envs.find(
        (e) => e.name === envName || e.name.toLowerCase() === envName.toLowerCase()
      );
      if (!env) {
        const names = envs.map((e) => e.name).join(', ');
        console.error(`Error: environment "${envName}" not found. Available: ${names || '(none)'}`);
        process.exit(1);
      }
      if (outputFormat === 'json') {
        const out: Record<string, unknown> = { name: env.name, active: env.active };
        out.variables = showValues ? (env.variables ?? {}) : Object.keys(env.variables ?? {});
        process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      } else {
        const rows = Object.entries(env.variables ?? {}).map(([key, value]) => ({
          key,
          value: showValues ? String(value) : '(hidden)',
        }));
        console.log(`Environment: ${env.name}${env.active ? ' (active)' : ''}`);
        outputListResult(rows, 'table', ['key', 'value']);
      }

    } else if (subcommand === 'set') {
      const envName = positionals[0];
      let key: string | undefined;
      let value: string | undefined;

      if (positionals[1]?.includes('=')) {
        const eqIdx = positionals[1].indexOf('=');
        key = positionals[1].slice(0, eqIdx);
        value = positionals[1].slice(eqIdx + 1);
      } else {
        key = positionals[1];
        value = positionals[2];
      }

      if (!envName || !key || value === undefined) {
        console.error('Usage: http-forge env set <env-name> <key> <value>');
        console.error('   or: http-forge env set <env-name> <key>=<value>');
        process.exit(2);
      }

      const shared = container.environmentConfig.getSharedConfig();
      if (!shared) {
        console.error('Error: could not load environment config at this workspace');
        process.exit(1);
      }
      shared.environments = shared.environments ?? {};
      if (!shared.environments[envName]) {
        console.error(`Error: environment "${envName}" does not exist.`);
        const names = Object.keys(shared.environments).join(', ');
        if (names) console.error(`Available environments: ${names}`);
        process.exit(1);
      }
      shared.environments[envName].variables = shared.environments[envName].variables ?? {};
      shared.environments[envName].variables[key] = value;
      container.environmentConfig.saveSharedConfig(shared);
      process.stdout.write(`${JSON.stringify({ set: true, environment: envName, key, value }, null, 2)}\n`);

    } else if (subcommand === 'unset') {
      const envName = positionals[0];
      const key = positionals[1];
      if (!envName || !key) {
        console.error('Usage: http-forge env unset <env-name> <key>');
        process.exit(2);
      }
      const shared = container.environmentConfig.getSharedConfig();
      if (!shared?.environments?.[envName]) {
        console.error(`Error: environment "${envName}" not found`);
        process.exit(1);
      }
      const wasPresent = key in (shared.environments[envName].variables ?? {});
      if (wasPresent) {
        delete shared.environments[envName].variables![key];
        container.environmentConfig.saveSharedConfig(shared);
      }
      process.stdout.write(
        `${JSON.stringify({ unset: wasPresent, environment: envName, key }, null, 2)}\n`
      );

    } else {
      console.error(`Unknown env subcommand: "${subcommand}". Valid: list, get, set, unset`);
      process.exit(2);
    }
  } finally {
    try { (container as any).dispose?.(); } catch { /* best-effort */ }
  }
}
