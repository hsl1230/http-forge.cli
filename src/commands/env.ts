/**
 * Env command — read and write environment variables in the workspace config.
 *
 *   http-forge env list
 *   http-forge env get <name> [--output table] [--no-values]
 *   http-forge env set <env> <key> <value>
 *   http-forge env set <env> <key>=<value>
 *   http-forge env unset <env> <key>
 *   http-forge import env --postman <file> [--env <name>] [--overwrite]
 *
 * All subcommands support --workspace and --json / --output.
 */

import { createNodeContainer, parsePostmanEnvironment } from '@http-forge/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
      container.dispose();
      process.exit(0);

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
      container.dispose();
      process.exit(0);

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
      container.dispose();
      process.exit(0);

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
      container.dispose();
      process.exit(0);

    } else {
      console.error(`Unknown env subcommand: "${subcommand}". Valid: list, get, set, unset`);
      container.dispose();
      process.exit(2);
    }
  } catch (err) {
    try { container.dispose(); } catch { /* best-effort */ }
    throw err;
  }
}

export async function handleEnvImport(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printEnvImportUsage();
    return;
  }

  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  let outputFormat: 'json' | 'table' = 'json';
  let postmanEnvFile: string | undefined;
  let importEnvName: string | undefined;
  let overwriteImport = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--workspace' && i + 1 < args.length) {
      workspace = args[++i];
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      outputFormat = args[++i] === 'table' ? 'table' : 'json';
    } else if (arg === '--postman' && i + 1 < args.length) {
      postmanEnvFile = args[++i];
    } else if ((arg === '--env' || arg === '--environment') && i + 1 < args.length) {
      importEnvName = args[++i];
    } else if (arg === '--overwrite') {
      overwriteImport = true;
    }
  }

  if (!postmanEnvFile) {
    console.error('Usage: http-forge import env --postman <file> [--env <name>] [--overwrite]');
    process.exit(2);
  }

  const filePath = path.resolve(process.cwd(), postmanEnvFile);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Postman environment file not found: ${filePath}`);
    process.exit(1);
  }

  const parsed = parsePostmanEnvironment(fs.readFileSync(filePath, 'utf-8'));
  if (!parsed) {
    console.error(`Error: failed to parse Postman environment file: ${filePath}`);
    process.exit(1);
  }

  const container = createNodeContainer(workspace);

  try {
    const targetEnv = importEnvName || parsed.name || 'imported-environment';
    const shared = container.environmentConfig.getSharedConfig();
    if (!shared) {
      console.error('Error: could not load environment config at this workspace');
      process.exit(1);
    }

    shared.environments = shared.environments ?? {};
    const alreadyExists = !!shared.environments[targetEnv];
    if (alreadyExists && !overwriteImport) {
      console.error(
        `Error: environment "${targetEnv}" already exists. Re-run with --overwrite to replace variables.`
      );
      process.exit(1);
    }

    shared.environments[targetEnv] = shared.environments[targetEnv] ?? {};
    shared.environments[targetEnv].variables = parsed.variables;
    if (parsed.description) {
      shared.environments[targetEnv].description = parsed.description;
    }
    container.environmentConfig.saveSharedConfig(shared);

    const result = {
      imported: true,
      source: 'postman-environment',
      file: filePath,
      environment: targetEnv,
      variableCount: Object.keys(parsed.variables).length,
      overwritten: alreadyExists,
    };

    if (outputFormat === 'table') {
      console.log(`Imported Postman environment: ${targetEnv}`);
      console.log(`Variables: ${result.variableCount}`);
      console.log(`Source: ${filePath}`);
      if (alreadyExists) {
        console.log('Mode: overwrite');
      }
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
  } finally {
    container.dispose();
    process.exit(0);
  }
}

function printEnvImportUsage(): void {
  console.log(`
Usage: http-forge import env --postman <file> [options]

Import a Postman environment JSON export into an HTTP Forge environment.

Required:
  --postman <file>        Postman environment JSON file

Options:
  --env <name>            Target environment name override
  --environment <name>    Same as --env (long form)
  --overwrite             Replace target env variables if it already exists
  --workspace <path>      Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  -h, --help              Show this help

Examples:
  http-forge import env --postman ./MyEnv.postman_environment.json
  http-forge import env --postman ./MyEnv.postman_environment.json --env staging --overwrite
`);
}
