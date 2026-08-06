/**
 * drift command — check whether a backend project has drifted since a discovery
 * index was built (git HEAD hash in git work trees; source mtime otherwise).
 *
 *   http-forge drift --path ./backend
 *   http-forge drift --path ./backend --stored-git-hash <sha>
 *
 * All freshness/drift logic lives in @http-forge/core (drift-engine).
 */

import {
  computeProjectFreshness,
  detectProjectDrift,
} from '@http-forge/core';

export async function handleDrift(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let projectPath: string | undefined;
  let storedGitHash: string | undefined;
  let storedScannedAt: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--path' || arg === '-p') && i + 1 < args.length) projectPath = args[++i];
    else if (arg === '--stored-git-hash' && i + 1 < args.length) storedGitHash = args[++i];
    else if (arg === '--stored-scanned-at' && i + 1 < args.length) storedScannedAt = args[++i];
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
  }

  const root = projectPath ?? process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  if (!storedGitHash && !storedScannedAt) {
    const freshness = computeProjectFreshness(root);
    if (outputFormat === 'json') {
      process.stdout.write(
        JSON.stringify({
          projectRoot: root,
          status: 'unknown',
          freshness: {
            gitHash: freshness.gitHash ?? null,
            maxSourceMtime: freshness.maxSourceMtime,
          },
          hint: 'Pass --stored-git-hash (and/or --stored-scanned-at) from a prior scan to get a current/stale verdict.',
        }, null, 2) + '\n'
      );
    } else {
      console.log(`Project: ${root}`);
      console.log(`  git HEAD: ${freshness.gitHash?.slice(0, 12) ?? '(not a git work tree)'}`);
      console.log(`  newest source file: ${new Date(freshness.maxSourceMtime).toISOString()}`);
      console.log('\n  No stored index given. Re-run with --stored-git-hash <sha> to detect drift.');
    }
    return;
  }

  const drift = detectProjectDrift(root, {
    gitHash: storedGitHash,
    scannedAt: storedScannedAt ?? new Date(0).toISOString(),
  });

  if (outputFormat === 'json') {
    process.stdout.write(
      JSON.stringify({
        projectRoot: root,
        status: drift.status,
        reason: drift.reason,
        freshness: {
          gitHash: drift.currentFreshness.gitHash ?? null,
          maxSourceMtime: drift.currentFreshness.maxSourceMtime,
        },
        stored: drift.storedFreshness ? { gitHash: drift.storedFreshness.gitHash ?? null } : null,
      }, null, 2) + '\n'
    );
    return;
  }

  console.log(`Project: ${root}`);
  console.log(`  status: ${drift.status}`);
  if (drift.reason) console.log(`  reason: ${drift.reason}`);
  console.log(`  git HEAD: ${drift.currentFreshness.gitHash?.slice(0, 12) ?? '(not a git work tree)'}`);
  if (drift.status === 'stale') {
    console.log('\n  Project drifted since the last scan.');
    console.log('  Re-run: http-forge generate-suite --path <root> --collection <ref> to regenerate.');
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge drift --path <root> [options]

Check whether a backend project has drifted since its discovery index was built.
In git work trees compares the git HEAD hash; otherwise degrades to source-file
mtime vs the stored scan time.

Options:
  --path <path>             Project root to check (default: $HTTP_FORGE_WORKSPACE or cwd)
  --stored-git-hash <sha>   Git HEAD hash from a prior scan (enables git-based drift)
  --stored-scanned-at <iso> ScannedAt timestamp from a prior scan (mtime-based drift)
  --output json|table       Output format (default: json)
  --json                    Short for --output json
  -h, --help                Show this help

Examples:
  http-forge drift --path ./backend
  http-forge drift --path ./backend --stored-git-hash abc1234...
`);
}
