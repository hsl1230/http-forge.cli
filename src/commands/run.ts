/**
 * Run commands: execute requests, collections, folders, suites, and code snippets.
 *
 * Positional-name syntax:
 *   http-forge run collection "Auth Flow" --env staging
 *   http-forge run suite "Regression" --env prod
 *   http-forge run request "Login" --collection "Auth"
 *   http-forge run folder "Auth/Login" --collection "Auth"
 *
 * Path-based syntax (workspace-relative directory):
 *   http-forge run collections/my-api
 *   http-forge run suites/smoke-tests
 *   http-forge run collections/my-api/folders/auth
 *   http-forge run collections/my-api/requests/login
 */

import { createNodeContainer, runCollection, runFolder, runRequest, runSuite } from '@http-forge/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  finalizeCiReports,
  installStdoutGuard,
  logResolution,
  mergeProcessEnv,
  outputResult,
  parseArgs,
} from '../output/format';

// ────────────────────────────────────────────────────────
// Run-request
// ────────────────────────────────────────────────────────

export async function handleRunRequest(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);
  const restore = installStdoutGuard();

  if (!opts.collection || !opts.request) {
    console.error('Error: --collection and --request are required');
    process.exit(2);
  }

  try {
    const result = await runRequest({
      workspaceFolder: opts.workspace,
      collectionRef: opts.collection,
      requestRef: opts.request,
      folderRef: opts.folder,
      onResolve: logResolution,
      environment: opts.environment,
      variables: opts.variables,
      include: opts.include,
      reporters: opts.reporters.map((r) => r.name),
    });
    outputResult(result, opts.output);
    finalizeCiReports(result, opts);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Run-collection
// ────────────────────────────────────────────────────────

export async function handleRunCollection(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);
  const restore = installStdoutGuard();

  if (!opts.collection) {
    console.error('Error: --collection is required');
    process.exit(2);
  }

  try {
    const result = await runCollection({
      workspaceFolder: opts.workspace,
      collectionRef: opts.collection,
      onResolve: logResolution,
      environment: opts.environment,
      variables: opts.variables,
      iterations: opts.iterations,
      concurrency: opts.concurrency,
      stopOnError: opts.stopOnError,
      delay: opts.delay,
      include: opts.include,
      reporters: opts.reporters.map((r) => r.name),
    });
    outputResult(result, opts.output);
    finalizeCiReports(result, opts);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Run-folder
// ────────────────────────────────────────────────────────

export async function handleRunFolder(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);
  const restore = installStdoutGuard();

  if (!opts.collection) {
    console.error('Error: --collection is required');
    process.exit(2);
  }
  if (!opts.folder) {
    console.error('Error: --folder is required');
    process.exit(2);
  }

  try {
    const result = await runFolder({
      workspaceFolder: opts.workspace,
      collectionRef: opts.collection,
      folderRef: opts.folder,
      onResolve: logResolution,
      recursive: opts.recursive,
      environment: opts.environment,
      variables: opts.variables,
      iterations: opts.iterations,
      concurrency: opts.concurrency,
      stopOnError: opts.stopOnError,
      delay: opts.delay,
      include: opts.include,
      reporters: opts.reporters.map((r) => r.name),
    });
    outputResult(result, opts.output);
    finalizeCiReports(result, opts);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Run-suite
// ────────────────────────────────────────────────────────

/** Resolve a suite name or id to a suite id, or return the input as-is. */
async function resolveSuiteId(workspace: string, ref: string): Promise<string> {
  const container = createNodeContainer(workspace);
  try {
    const suites = await container.testSuite.getAllSuites();
    // exact id match
    if (suites.find((s) => s.id === ref)) return ref;
    // exact name match
    const byName = suites.find((s) => s.name === ref);
    if (byName) return byName.id;
    // case-insensitive name match
    const q = ref.toLowerCase();
    const byNameCI = suites.find((s) => s.name.toLowerCase() === q);
    if (byNameCI) return byNameCI.id;
    // fall through — let runSuite produce the "not found" error
    return ref;
  } finally {
    try { (container as any).dispose?.(); } catch { /* best-effort */ }
  }
}

export async function handleRunSuite(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);
  const restore = installStdoutGuard();

  if (!opts.suite) {
    console.error('Error: --suite is required');
    process.exit(2);
  }

  try {
    const suiteId = await resolveSuiteId(opts.workspace, opts.suite);
    const result = await runSuite({
      workspaceFolder: opts.workspace,
      suiteId,
      environment: opts.environment,
      variables: opts.variables,
      iterations: opts.iterations,
      concurrency: opts.concurrency,
      stopOnError: opts.stopOnError,
      delay: opts.delay,
      requestFilter: opts.requestFilter,
      include: opts.include,
      reporters: opts.reporters.map((r) => r.name),
    });
    outputResult(result, opts.output);
    finalizeCiReports(result, opts);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Path-based dispatch helpers
// ────────────────────────────────────────────────────────

/** Extract --workspace value from an args list, falling back to env/cwd. */
function extractWorkspace(args: string[]): string {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === '--workspace') return args[i + 1];
  }
  return process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
}

/**
 * Walk up from `startDir` toward `root`, returning the first directory that
 * contains `filename`, or undefined if none is found.
 */
function findAncestorWithFile(
  startDir: string,
  filename: string,
  root: string
): string | undefined {
  let current = path.resolve(startDir);
  const resolvedRoot = path.resolve(root);
  while (current.length >= resolvedRoot.length) {
    if (fs.existsSync(path.join(current, filename))) return current;
    if (current === resolvedRoot) break;
    current = path.dirname(current);
  }
  return undefined;
}

/** Return true if `flag` already appears in `args`. */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

/**
 * Path-based run dispatch — resolves a workspace-relative directory path and
 * detects what to run from its marker file:
 *
 *   suite.json      → run suite
 *   collection.json → run collection
 *   folder.json     → run folder  (derives --collection from ancestor)
 *   request.json    → run request (derives --collection from ancestor)
 */
async function handleRunPath(relPath: string, remainingArgs: string[]): Promise<void> {
  const workspace = extractWorkspace(remainingArgs);
  const absPath = path.isAbsolute(relPath) ? relPath : path.join(workspace, relPath);

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    console.error(`Error: "${relPath}" is not a directory relative to workspace "${workspace}"`);
    process.exit(2);
  }

  const suiteJson   = path.join(absPath, 'suite.json');
  const colJson     = path.join(absPath, 'collection.json');
  const folderJson  = path.join(absPath, 'folder.json');
  const requestJson = path.join(absPath, 'request.json');

  if (fs.existsSync(suiteJson)) {
    const suite = JSON.parse(fs.readFileSync(suiteJson, 'utf-8'));
    const ref = suite.id ?? suite.name;
    if (!ref) { console.error('Error: suite.json has no id or name'); process.exit(2); }
    await handleRunSuite(['--suite', ref, ...remainingArgs]);

  } else if (fs.existsSync(colJson)) {
    const col = JSON.parse(fs.readFileSync(colJson, 'utf-8'));
    const ref = col.id ?? col.name;
    if (!ref) { console.error('Error: collection.json has no id or name'); process.exit(2); }
    await handleRunCollection(['--collection', ref, ...remainingArgs]);

  } else if (fs.existsSync(folderJson)) {
    const folder = JSON.parse(fs.readFileSync(folderJson, 'utf-8'));
    const folderRef = folder.id ?? folder.name;
    if (!folderRef) { console.error('Error: folder.json has no id or name'); process.exit(2); }
    const extraArgs: string[] = [];
    if (!hasFlag(remainingArgs, '--collection')) {
      const colDir = findAncestorWithFile(path.dirname(absPath), 'collection.json', workspace);
      if (!colDir) {
        console.error(`Error: could not find a collection.json ancestor for "${relPath}"`);
        process.exit(2);
      }
      const col = JSON.parse(fs.readFileSync(path.join(colDir, 'collection.json'), 'utf-8'));
      extraArgs.push('--collection', col.id ?? col.name);
    }
    await handleRunFolder(['--folder', folderRef, ...extraArgs, ...remainingArgs]);

  } else if (fs.existsSync(requestJson)) {
    const req = JSON.parse(fs.readFileSync(requestJson, 'utf-8'));
    const requestRef = req.id ?? req.name;
    if (!requestRef) { console.error('Error: request.json has no id or name'); process.exit(2); }
    const extraArgs: string[] = [];
    if (!hasFlag(remainingArgs, '--collection')) {
      const colDir = findAncestorWithFile(path.dirname(absPath), 'collection.json', workspace);
      if (!colDir) {
        console.error(`Error: could not find a collection.json ancestor for "${relPath}"`);
        process.exit(2);
      }
      const col = JSON.parse(fs.readFileSync(path.join(colDir, 'collection.json'), 'utf-8'));
      extraArgs.push('--collection', col.id ?? col.name);
    }
    await handleRunRequest(['--request', requestRef, ...extraArgs, ...remainingArgs]);

  } else {
    console.error(
      `Error: no collection.json, folder.json, request.json, or suite.json found in "${relPath}"`
    );
    process.exit(2);
  }
}

// ────────────────────────────────────────────────────────
// `run` group — positional-name syntax
// ────────────────────────────────────────────────────────

/**
 * Extract the first positional argument (not a flag and not a flag value) from
 * the args list. Flags that consume the following arg are listed in
 * `flagsWithValues`.
 */
function extractFirstPositional(args: string[]): [string | undefined, string[]] {
  const flagsWithValues = new Set([
    '--workspace', '--env', '--environment', '--collection', '--request', '--suite',
    '--folder', '--output', '--var', '--include', '--reporter', '--out',
    '--delay', '--iterations', '--concurrency', '--request-filter',
  ]);

  const remaining: string[] = [];
  let positional: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      remaining.push(arg);
      if (flagsWithValues.has(arg) && i + 1 < args.length) {
        remaining.push(args[++i]);
      }
    } else if (!positional) {
      positional = arg;
    } else {
      remaining.push(arg);
    }
  }

  return [positional, remaining];
}

/**
 * `http-forge run <type> [name] [options]`
 *
 * Shorter, positional-name routing over the underlying flag-based handlers:
 *
 *   http-forge run collection "Auth Flow" --env staging
 *   http-forge run suite "Regression" --env prod --stop-on-error
 *   http-forge run request "Login" --collection "Auth" --include body,headers
 *   http-forge run folder "Auth/Login" --collection "Auth"
 *
 * The resource name is the first non-flag argument; all other flags are passed
 * through unchanged to the underlying handler.
 */
export async function handleRunGroup(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`
Usage: http-forge run <type|path> [name] [options]

Types:
  collection <name|slug|id>   Run all requests in a collection
  suite <name|id>             Run a test suite
  request <name|slug|id>      Run a single request (also needs --collection)
  folder <path|slug|id>       Run requests under a folder (also needs --collection)

Path-based (workspace-relative directory):
  <path>                      Auto-detect type from collection.json / folder.json /
                              request.json / suite.json in that directory

Options:
  --env <name>         Environment to activate (default: $HTTP_FORGE_ENV)
  --environment <name> Same as --env (long form)
  --workspace <path>   Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  --collection <ref>   Collection name or id (required for 'request' and 'folder')
  --iterations <num>   Number of iterations
  --concurrency <num>  Parallel virtual users
  --stop-on-error      Stop on first failure
  --exit-code          Exit 1 when any assertion fails
  --reporter <spec>    Generate a report: html, junit, or name:path
  --var <KEY=VALUE>    Override a variable
  --include <field>    Extra output fields
  --output json|table  Display format (default: json)
  --json               Short for --output json

Examples:
  http-forge run collection "Auth Flow" --env staging
  http-forge run suite "Regression" --env prod --stop-on-error
  http-forge run request "Login" --collection "Auth" --include body,headers
  http-forge run folder "Auth/Login" --collection "Auth" --env dev
  http-forge run collections/my-api --env staging
  http-forge run suites/smoke-tests --env prod --exit-code
  http-forge run collections/my-api/folders/auth --env dev
  http-forge run collections/my-api/requests/login
`);
    return;
  }

  const restArgs = args.slice(1);

  switch (subcommand) {
    case 'collection': {
      const [name, remaining] = extractFirstPositional(restArgs);
      await handleRunCollection(name ? ['--collection', name, ...remaining] : remaining);
      break;
    }
    case 'suite': {
      const [name, remaining] = extractFirstPositional(restArgs);
      await handleRunSuite(name ? ['--suite', name, ...remaining] : remaining);
      break;
    }
    case 'request': {
      const [name, remaining] = extractFirstPositional(restArgs);
      await handleRunRequest(name ? ['--request', name, ...remaining] : remaining);
      break;
    }
    case 'folder': {
      const [name, remaining] = extractFirstPositional(restArgs);
      await handleRunFolder(name ? ['--folder', name, ...remaining] : remaining);
      break;
    }
    default:
      // Not a known type keyword — try path-based dispatch
      if (!subcommand.startsWith('--')) {
        await handleRunPath(subcommand, args.slice(1));
      } else {
        console.error(
          `Unknown run type: "${subcommand}". Valid: collection, suite, request, folder, or a workspace-relative path`
        );
        process.exit(2);
      }
  }
}

// ────────────────────────────────────────────────────────
// Copy-as (code snippet generation)
// ────────────────────────────────────────────────────────

export async function handleCopyAs(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: http-forge copy-as [options]

Generate a ready-to-run request snippet in curl, fetch, or python.

Required:
  --collection <ref>      Collection id, slug, or display name
  --request <ref>         Request id, slug, or display name
  --lang <name>           Target language: curl, fetch, python

Options:
  --folder <path>         Scope resolution to a sub-folder
  --env <name>            Environment to resolve variables against
  --environment <name>    Same as --env (long form)
  --workspace <path>      Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  -h, --help              Show this help

Examples:
  http-forge copy-as --collection my-api --request get-users --lang curl
  http-forge copy-as --collection my-api --request "Create User" --lang python
`);
    return;
  }

  let workspace = process.cwd();
  let collectionRef: string | undefined;
  let requestRef: string | undefined;
  let folderRef: string | undefined;
  let lang: string | undefined;
  let environment: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) workspace = args[++i];
    else if (args[i] === '--collection' && i + 1 < args.length) collectionRef = args[++i];
    else if (args[i] === '--request' && i + 1 < args.length) requestRef = args[++i];
    else if (args[i] === '--folder' && i + 1 < args.length) folderRef = args[++i];
    else if ((args[i] === '--env' || args[i] === '--environment') && i + 1 < args.length) environment = args[++i];
    else if (args[i] === '--lang' && i + 1 < args.length) lang = args[++i];
  }

  if (!collectionRef || !requestRef || !lang) {
    console.error('Error: --collection, --request, and --lang are required');
    process.exit(2);
  }

  const supportedLangs = ['curl', 'fetch', 'python'];
  if (!supportedLangs.includes(lang)) {
    console.error(`Error: --lang must be one of: ${supportedLangs.join(', ')}`);
    process.exit(2);
  }

  const collectionsDir = path.join(workspace, 'http-forge-assets', 'collections');
  const altCollectionsDir = path.join(workspace, 'collections');
  const baseDir = fs.existsSync(altCollectionsDir) ? altCollectionsDir : collectionsDir;

  if (!fs.existsSync(baseDir)) {
    console.error(`Error: collections directory not found at ${baseDir}`);
    process.exit(2);
  }

  const requestJsonPath = findRequestJson(baseDir, collectionRef, requestRef, folderRef);
  if (!requestJsonPath) {
    console.error(`Error: could not find request "${requestRef}" in collection "${collectionRef}"`);
    process.exit(2);
  }

  try {
    const container = createNodeContainer(workspace);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateSnippet, parseRequest } = require('@http-forge/codegen');
    const collectionDir = path.dirname(requestJsonPath.replace(/\/[^/]+\/request\.json$/, ''));
    const req = parseRequest(requestJsonPath, collectionDir);
    if (!req) { console.error('Error: failed to parse request.json'); process.exit(2); }

    if (environment) {
      req.url = container.environmentConfig.resolveVariables(req.url, environment);

      if (req.headers) {
        for (const [k, v] of Object.entries(req.headers)) {
          req.headers[k] = container.environmentConfig.resolveVariables(String(v), environment);
        }
      }

      if (req.queryParams) {
        for (const [k, v] of Object.entries(req.queryParams)) {
          req.queryParams[k] = container.environmentConfig.resolveVariables(String(v), environment);
        }
      }

      if (typeof req.body === 'string') {
        req.body = container.environmentConfig.resolveVariables(req.body, environment);
      } else if (req.body && typeof req.body === 'object') {
        req.body = container.environmentConfig.resolveVariablesInObject(req.body, environment);
      }
    }

    process.stdout.write(generateSnippet(req, lang) + '\n');
    try { (container as any).dispose?.(); } catch { /* best-effort */ }
  } catch {
    try {
      const container = createNodeContainer(workspace);
      const raw = JSON.parse(fs.readFileSync(requestJsonPath, 'utf-8'));
      const method = (raw.method ?? 'GET').toUpperCase();
      const url = environment
        ? container.environmentConfig.resolveVariables(raw.url ?? '', environment)
        : (raw.url ?? '');
      const headers: Array<[string, string]> = (raw.headers ?? [])
        .filter((h: any) => h.enabled !== false)
        .map((h: any) => {
          const value = environment
            ? container.environmentConfig.resolveVariables(String(h.value ?? ''), environment)
            : String(h.value ?? '');
          return [h.name as string, value] as [string, string];
        });

      if (lang === 'curl') {
        const parts = [`curl -X ${method} '${url}'`];
        for (const [k, v] of headers) parts.push(`  -H '${k}: ${v}'`);
        process.stdout.write(parts.join(' \\\n') + '\n');
        try { (container as any).dispose?.(); } catch { /* best-effort */ }
      } else {
        console.error('Install @http-forge/codegen for fetch/python snippet support.');
        process.exit(2);
      }
    } catch (e) {
      console.error(`Error reading request.json: ${(e as Error).message}`);
      process.exit(2);
    }
  }
}

function findRequestJson(
  baseDir: string,
  collectionRef: string,
  requestRef: string,
  folderRef?: string
): string | null {
  let collectionDirs: string[];
  try {
    collectionDirs = fs.readdirSync(baseDir).filter((d) =>
      fs.statSync(path.join(baseDir, d)).isDirectory()
    );
  } catch { return null; }

  const q = collectionRef.toLowerCase();
  const matchedCols = collectionDirs.filter(
    (d) => d === collectionRef || d.toLowerCase().includes(q)
  );

  for (const col of matchedCols) {
    const found = searchRequestJson(path.join(baseDir, col), requestRef, folderRef);
    if (found) return found;
  }
  return null;
}

function searchRequestJson(dir: string, requestRef: string, folderRef?: string): string | null {
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return null; }

  const q = requestRef.toLowerCase();
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (!fs.statSync(full).isDirectory()) continue;

    const candidate = path.join(full, 'request.json');
    if (fs.existsSync(candidate) && (entry === requestRef || entry.toLowerCase().includes(q))) {
      return candidate;
    }
    const found = searchRequestJson(full, requestRef, folderRef);
    if (found) return found;
  }
  return null;
}
