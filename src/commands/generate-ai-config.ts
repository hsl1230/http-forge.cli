/**
 * generate-ai-config command — create thin pointer files so AI tools discover
 * the HTTP Forge guide in `.http-forge/AGENTS.md`.
 *
 *   http-forge generate-ai-config --tool claude   (dry-run status)
 *   http-forge generate-ai-config --tool all --apply
 *
 * Supported tools: claude, copilot, opencode, cursor, all.
 * Dry-run by default; pass --apply to write files.
 */

import * as fs from 'fs';
import * as path from 'path';

const SHIMS: Record<string, { path: string; content: string }> = {
  claude: {
    path: '.claude/commands/http-forge.md',
    content: 'See .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  },
  copilot: {
    path: '.github/copilot-instructions.md',
    content: 'See .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  },
  opencode: {
    path: '.opencode/commands/http-forge.md',
    content: 'See .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  },
  cursor: {
    path: '.cursor/rules/http-forge.mdc',
    content: '---\nalwaysApply: true\n---\n\nSee .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  },
};

const ALL_TOOLS = ['claude', 'copilot', 'opencode', 'cursor'];

export async function handleGenerateAiConfig(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let tool = 'all';
  let workspace: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';
  let apply = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tool' && i + 1 < args.length) tool = args[++i];
    else if ((arg === '--workspace' || arg === '-w') && i + 1 < args.length) workspace = args[++i];
    else if (arg === '--apply') apply = true;
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
  }

  const root = workspace ?? process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  const tools = tool === 'all' ? ALL_TOOLS : [tool];

  const results: Array<{ tool: string; path: string; status: string }> = [];

  for (const t of tools) {
    const shim = SHIMS[t];
    if (!shim) {
      results.push({ tool: t, path: '', status: 'unknown tool' });
      continue;
    }
    const target = path.join(root, shim.path);
    const exists = fs.existsSync(target);
    if (!apply) {
      results.push({ tool: t, path: target, status: exists ? 'exists' : 'missing' });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (exists) {
      // Append only if not already present
      const current = fs.readFileSync(target, 'utf-8');
      if (!current.includes('.http-forge/AGENTS.md')) {
        fs.appendFileSync(target, shim.content, 'utf-8');
        results.push({ tool: t, path: target, status: 'appended' });
      } else {
        results.push({ tool: t, path: target, status: 'already configured' });
      }
    } else {
      fs.writeFileSync(target, shim.content, 'utf-8');
      results.push({ tool: t, path: target, status: 'created' });
    }
  }

  if (outputFormat === 'json') {
    process.stdout.write(JSON.stringify({ tool, apply, results }, null, 2) + '\n');
    return;
  }
  console.log(`Tool: ${tool}`);
  console.log(`Apply: ${apply}`);
  for (const r of results) {
    console.log(`  ${r.tool}: ${r.status} (${r.path})`);
  }
  if (!apply) {
    console.log('\nRe-run with --apply to write the shim files.');
  }
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge generate-ai-config --tool <name> [options]

Create thin pointer files so AI tools discover the HTTP Forge guide in
.http-forge/AGENTS.md. Dry-run by default; pass --apply to write files.

Options:
  --tool <name>           claude | copilot | opencode | cursor | all (default: all)
  --workspace, -w <path>  Workspace root (default: $HTTP_FORGE_WORKSPACE or cwd)
  --apply                 Write the shim files (default: status only)
  --output, --json        Output format: json (default) or table

Examples:
  http-forge generate-ai-config --tool claude --apply
  http-forge generate-ai-config --tool all --apply
  http-forge generate-ai-config --tool copilot
`);
}
