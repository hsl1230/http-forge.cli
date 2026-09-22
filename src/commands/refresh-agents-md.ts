/**
 * refresh-agents-md command — check the versioned `.http-forge/AGENTS.md`
 * guide for staleness, and optionally refresh it with backup.
 *
 *   http-forge refresh-agents-md --workspace <root>   (dry-run status)
 *   http-forge refresh-agents-md --apply               (backup + rewrite)
 *
 * Dry-run by default (mirrors `suggest-env` without `--apply`): nothing is
 * written unless `--apply` is passed. All guide logic lives in
 * `@http-forge/core` (agents-md).
 */

import * as path from 'path';
import {
  getAgentsMdStatus,
  refreshAgentsMd,
} from '@http-forge/core';

export async function handleRefreshAgentsMd(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let workspace: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';
  let apply = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--workspace' || arg === '-w') && i + 1 < args.length) workspace = args[++i];
    else if (arg === '--apply') apply = true;
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
  }

  const root = workspace ?? process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  const forgeDir = path.join(root, '.http-forge');

  if (!apply) {
    const status = getAgentsMdStatus(forgeDir);
    if (outputFormat === 'json') {
      process.stdout.write(
        JSON.stringify({
          path: status.path,
          exists: status.exists,
          currentVersion: status.currentVersion,
          latestVersion: status.latestVersion,
          stale: status.stale,
          hint: status.stale
            ? 'Re-run with --apply to back up the current guide to AGENTS.md.bak and write the latest template.'
            : undefined,
        }, null, 2) + '\n'
      );
    } else {
      console.log(`Guide: ${status.path}`);
      console.log(`  exists: ${status.exists}`);
      console.log(`  version: ${status.currentVersion} (latest: ${status.latestVersion})`);
      console.log(`  stale: ${status.stale}`);
      if (status.stale) {
        console.log('\n  Re-run with --apply to refresh (backs up to AGENTS.md.bak).');
      }
    }
    return;
  }

  const result = refreshAgentsMd(forgeDir);
  if (outputFormat === 'json') {
    process.stdout.write(
      JSON.stringify({
        path: result.path,
        backupPath: result.backupPath,
        previousVersion: result.previousVersion,
        version: result.version,
        created: result.created,
      }, null, 2) + '\n'
    );
    return;
  }

  console.log(`Guide: ${result.path}`);
  if (result.created) {
    console.log(`  created at version ${result.version} (no previous file, no backup).`);
  } else {
    console.log(`  refreshed v${result.previousVersion} → v${result.version}`);
    console.log(`  backup: ${result.backupPath}`);
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge refresh-agents-md [--workspace <root>] [--apply] [--output json|table]

Check whether the versioned .http-forge/AGENTS.md AI agent guide is stale.
Dry-run by default (nothing is written); pass --apply to back up the current
guide to AGENTS.md.bak and write the latest template.

Options:
  --workspace, -w <path>  Workspace root (default: $HTTP_FORGE_WORKSPACE or cwd)
  --apply                 Back up and rewrite the guide (default: status only)
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  -h, --help              Show this help

Examples:
  http-forge refresh-agents-md --workspace ./my-project
  http-forge refresh-agents-md --apply
`);
}
