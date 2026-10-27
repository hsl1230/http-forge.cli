/**
 * generate-ai-config command — create pointer files so AI tools discover
 * the HTTP Forge guide in `.http-forge/AGENTS.md`.
 *
 *   http-forge generate-ai-config --tool claude   (dry-run status)
 *   http-forge generate-ai-config --tool all --apply
 *   http-forge generate-ai-config --tool cursor --template --apply
 *
 * Supported tools: claude, copilot, opencode, cursor, all.
 * Dry-run by default; pass --apply to write files.
 * --template writes a richer shim with tool-specific frontmatter.
 */

import * as fs from 'fs';
import * as path from 'path';

const THIN: Record<string, string> = {
  claude: 'See .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  copilot: 'See .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  opencode: 'See .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
  cursor: '---\nalwaysApply: true\n---\n\nSee .http-forge/AGENTS.md for the HTTP Forge AI guide.\n',
};

const SHARED_BODY = `# HTTP Forge

Before generating or editing any HTTP Forge collection, request, suite, or script,
read \`.http-forge/AGENTS.md\` in the workspace root. It contains the folder
layout, JSON schemas, decision tree (direct file access vs CLI vs MCP), and
test-generation best practices.

Quick reference:
- Run a collection: \`http-forge run collection <name> --env <env> --json\`
- Run a suite: \`http-forge run suite <name> --json\`
- Design an API from intent: \`http-forge architect "<intent>" --apply\`
- QA gate: \`http-forge qa --path <project> --collection <ref> --base-url <url>\`
`;

const RICH: Record<string, string> = {
  claude: `---
description: HTTP Forge AI guide — read .http-forge/AGENTS.md before generating or editing requests, suites, or scripts.
---

` + SHARED_BODY,
  copilot: `---
applyTo: "**"
description: HTTP Forge AI guide — read .http-forge/AGENTS.md before generating or editing requests, suites, or scripts.
---

` + SHARED_BODY,
  opencode: `---
description: HTTP Forge AI guide — read .http-forge/AGENTS.md before generating or editing requests, suites, or scripts.
---

` + SHARED_BODY,
  cursor: `---
alwaysApply: true
description: HTTP Forge AI guide — read .http-forge/AGENTS.md before generating or editing requests, suites, or scripts.
---

` + SHARED_BODY,
};

const FILES: Record<string, string> = {
  claude: '.claude/commands/http-forge.md',
  copilot: '.github/copilot-instructions.md',
  opencode: '.opencode/commands/http-forge.md',
  cursor: '.cursor/rules/http-forge.mdc',
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
  let template = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tool' && i + 1 < args.length) tool = args[++i];
    else if ((arg === '--workspace' || arg === '-w') && i + 1 < args.length) workspace = args[++i];
    else if (arg === '--apply') apply = true;
    else if (arg === '--template') template = true;
    else if (arg === '--json') outputFormat = 'json';
    else if (arg === '--output' && i + 1 < args.length) outputFormat = args[++i] === 'table' ? 'table' : 'json';
  }

  const root = workspace ?? process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  const tools = tool === 'all' ? ALL_TOOLS : [tool];

  const results: Array<{ tool: string; path: string; status: string }> = [];

  for (const t of tools) {
    const shimPath = FILES[t];
    if (!shimPath) {
      results.push({ tool: t, path: '', status: 'unknown tool' });
      continue;
    }
    const target = path.join(root, shimPath);
    const content = template ? RICH[t] : THIN[t];
    const exists = fs.existsSync(target);
    if (!apply) {
      results.push({ tool: t, path: target, status: exists ? 'exists' : 'missing' });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (exists) {
      const current = fs.readFileSync(target, 'utf-8');
      if (!current.includes('.http-forge/AGENTS.md')) {
        fs.appendFileSync(target, '\n' + content, 'utf-8');
        results.push({ tool: t, path: target, status: 'appended' });
      } else {
        results.push({ tool: t, path: target, status: 'already configured' });
      }
    } else {
      fs.writeFileSync(target, content, 'utf-8');
      results.push({ tool: t, path: target, status: 'created' });
    }
  }

  if (outputFormat === 'json') {
    process.stdout.write(JSON.stringify({ tool, apply, template, results }, null, 2) + '\n');
    return;
  }
  console.log(`Tool: ${tool}`);
  console.log(`Apply: ${apply}`);
  console.log(`Template: ${template}`);
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
Use --template for a richer shim with tool-specific frontmatter.

Options:
  --tool <name>           claude | copilot | opencode | cursor | all (default: all)
  --template              Write a richer shim with tool-specific frontmatter
  --workspace, -w <path>  Workspace root (default: $HTTP_FORGE_WORKSPACE or cwd)
  --apply                 Write the shim files (default: status only)
  --output, --json        Output format: json (default) or table

Examples:
  http-forge generate-ai-config --tool claude --apply
  http-forge generate-ai-config --tool all --apply
  http-forge generate-ai-config --tool cursor --template --apply
  http-forge generate-ai-config --tool copilot
`);
}
