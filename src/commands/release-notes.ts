/**
 * release-notes command — Layer 6 docs as a byproduct of drift.
 *
 * Derives a markdown release-notes artifact from the project's git history
 * (conventional commits between two refs). No docs phase budget: the reviewer
 * ships the diff, this renders it.
 *
 *   http-forge release-notes --path <root>
 *   http-forge release-notes --path <root> --from <sha> --to <sha> --output markdown
 */

import { generateReleaseNotes, renderReleaseNotesMarkdown } from '@http-forge/core';
import type { ReleaseNotes } from '@http-forge/core';

interface ReleaseNotesArgs {
  path: string;
  from?: string;
  to?: string;
  outputFormat: 'json' | 'markdown';
}

export async function handleReleaseNotes(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  const parsed = parseArgs(args);
  const root = parsed.path;

  const notes = generateReleaseNotes({
    projectRoot: root,
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
  });

  if (!notes.gitAvailable) {
    console.error(`Error: ${root} is not a git work tree (git log failed).`);
    process.exit(2);
  }

  if (parsed.outputFormat === 'json') {
    process.stdout.write(JSON.stringify(notes, null, 2) + '\n');
  } else {
    process.stdout.write(renderReleaseNotesMarkdown(notes) + '\n');
  }
}

function parseArgs(args: string[]): ReleaseNotesArgs {
  const parsed: ReleaseNotesArgs = { path: process.cwd(), outputFormat: 'markdown' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--path' || arg === '-p') && i + 1 < args.length) parsed.path = args[++i];
    else if (arg === '--from' && i + 1 < args.length) parsed.from = args[++i];
    else if (arg === '--to' && i + 1 < args.length) parsed.to = args[++i];
    else if (arg === '--output' && i + 1 < args.length) {
      const v = args[++i];
      if (v === 'json') parsed.outputFormat = 'json';
    } else if (arg === '--json') parsed.outputFormat = 'json';
  }
  return parsed;
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge release-notes --path <root> [options]

Derive a release-notes artifact from a project's git history (conventional
commits between two refs). Layer 6 docs as a byproduct of drift.

Options:
  --path <root>    Project root (default: cwd)
  --from <ref>     Lower bound (exclusive). Defaults to the beginning of history.
  --to <ref>       Upper bound (inclusive). Defaults to HEAD.
  --output <fmt>   Output format: markdown | json (default: markdown)
  --json           Short for --output json
  -h, --help       Show this help

Examples:
  http-forge release-notes --path .
  http-forge release-notes --path ./http-forge.core --from v0.6.0 --to HEAD
  http-forge release-notes --path . --output json
`);
}
