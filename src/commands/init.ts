import * as fs from 'fs';
import * as path from 'path';
import { ensureAgentsMdFile, AGENTS_MD_VERSION } from '@http-forge/core';

export async function handleInit(args: string[]): Promise<void> {
  let workspace = process.cwd();
  let template = 'default';
  let examples = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) workspace = args[++i];
    else if (args[i] === '--template' && i + 1 < args.length) template = args[++i];
    else if (args[i] === '--examples') examples = true;
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: http-forge init [options]

Scaffold a new HTTP Forge workspace.

Options:
  --workspace <path>   Workspace folder (default: cwd)
  --template <name>    Template: default, examples, openapi (default: default)
  --examples           Include example collections and suites
  -h, --help           Show this help
`);
      return;
    }
  }

  const forgeDir = path.join(workspace, '.http-forge');
  const assetsDir = path.join(workspace, '.http-forge', 'assets');
  const collectionsDir = path.join(assetsDir, 'collections');
  const environmentsDir = path.join(assetsDir, 'environments');
  const suitesDir = path.join(assetsDir, 'suites');
  const knowledgeDir = path.join(forgeDir, 'knowledge');

  // Create directory structure
  for (const dir of [forgeDir, assetsDir, collectionsDir, environmentsDir, suitesDir, knowledgeDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create AGENTS.md
  ensureAgentsMdFile(forgeDir);

  // Create default environment
  const devEnv = path.join(environmentsDir, 'dev.json');
  if (!fs.existsSync(devEnv)) {
    fs.writeFileSync(devEnv, JSON.stringify({
      $schema: 'https://raw.githubusercontent.com/hsl1230/http-forge/main/resources/environment.schema.json',
      name: 'dev',
      variables: {
        base_url: 'http://localhost:3000',
      },
    }, null, 2), 'utf-8');
  }

  // Create global environment
  const globalEnv = path.join(environmentsDir, '_global.json');
  if (!fs.existsSync(globalEnv)) {
    fs.writeFileSync(globalEnv, JSON.stringify({
      $schema: 'https://raw.githubusercontent.com/hsl1230/http-forge/main/resources/global-environment.schema.json',
      variables: {},
      defaultHeaders: {
        'Accept': 'application/json',
      },
    }, null, 2), 'utf-8');
  }

  // Create knowledge README
  const knowledgeReadme = path.join(knowledgeDir, 'README.md');
  if (!fs.existsSync(knowledgeReadme)) {
    fs.writeFileSync(knowledgeReadme, '# Business Knowledge\n\nDrop markdown files here to provide business context for AI agents.\n', 'utf-8');
  }

  console.log(`HTTP Forge workspace initialized at: ${workspace}`);
  console.log(`  .http-forge/AGENTS.md  — AI agent guide`);
  console.log(`  assets/collections/     — collections`);
  console.log(`  assets/environments/    — environments (dev.json created)`);
  console.log(`  assets/suites/          — test suites`);
  console.log(`  .http-forge/knowledge/ — business context for AI`);
}
