/**
 * CLI Command Handlers
 * 
 * Implementations of CLI commands that use the runtime APIs.
 */

import type { ResolutionInfo } from '@http-forge/core';
import { createMcpRuntime, runCollection, runFolder, runRequest, runSuite } from '@http-forge/core';
import * as fs from 'fs';
import * as path from 'path';

interface McpServerState {
  pid: number;
  host: string;
  port: number;
  workspace: string;
  startedAt: string;
}

const MCP_STATE_FILENAME = 'mcp-server.json';

function getMcpStateFile(workspace: string): string {
  return path.join(workspace, '.http-forge-cache', MCP_STATE_FILENAME);
}

function writeMcpState(filePath: string, state: McpServerState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

function readMcpState(filePath: string): McpServerState | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as McpServerState;
  } catch {
    return null;
  }
}

function removeMcpState(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseMcpServerArgs(args: string[]): {
  action: 'start' | 'stop' | 'status';
  port: number;
  host: string;
  workspace: string;
} {
  let action: 'start' | 'stop' | 'status' = 'start';
  let port = 3100;
  let host = '127.0.0.1';
  let workspace = process.cwd();

  let i = 0;
  if (args[0] === 'start' || args[0] === 'stop' || args[0] === 'status') {
    action = args[0];
    i = 1;
  }

  for (; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[++i], 10);
    } else if (args[i] === '--host' && i + 1 < args.length) {
      host = args[++i];
    } else if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[++i];
    }
  }

  return { action, port, host, workspace };
}

// ────────────────────────────────────────────────────────
// MCP Server Command
// ────────────────────────────────────────────────────────

export async function handleMcpServer(args: string[]): Promise<void> {
  const { action, port, host, workspace } = parseMcpServerArgs(args);
  const stateFile = getMcpStateFile(workspace);

  if (action === 'status') {
    const state = readMcpState(stateFile);
    if (!state) {
      console.log('MCP server is not running (no state file found).');
      return;
    }

    if (!isPidAlive(state.pid)) {
      console.log(`MCP server state exists but process ${state.pid} is not running (stale state).`);
      return;
    }

    console.log(`MCP server is running:\n  PID: ${state.pid}\n  Host: ${state.host}\n  Port: ${state.port}\n  Workspace: ${state.workspace}\n  Started: ${state.startedAt}`);
    return;
  }

  if (action === 'stop') {
    const state = readMcpState(stateFile);
    if (!state) {
      console.log('MCP server is not running (no state file found).');
      return;
    }

    if (!isPidAlive(state.pid)) {
      console.log(`MCP server process ${state.pid} is not running; removing stale state file.`);
      removeMcpState(stateFile);
      return;
    }

    process.kill(state.pid, 'SIGTERM');
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!isPidAlive(state.pid)) break;
    }

    if (isPidAlive(state.pid)) {
      process.kill(state.pid, 'SIGKILL');
    }

    removeMcpState(stateFile);
    console.log(`MCP server stopped (PID ${state.pid}).`);
    return;
  }

  const existingState = readMcpState(stateFile);
  if (existingState && isPidAlive(existingState.pid)) {
    console.error(`MCP server already running on ${existingState.host}:${existingState.port} (PID ${existingState.pid}).`);
    process.exit(2);
  }

  if (existingState && !isPidAlive(existingState.pid)) {
    removeMcpState(stateFile);
  }

  const runtime = await createMcpRuntime({ workspaceFolder: workspace, port, host });
  await runtime.start();

  writeMcpState(stateFile, {
    pid: process.pid,
    host,
    port,
    workspace,
    startedAt: new Date().toISOString()
  });

  const shutdown = async (): Promise<void> => {
    try {
      await runtime.stop();
    } finally {
      removeMcpState(stateFile);
    }
  };

  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });

  process.on('exit', () => {
    removeMcpState(stateFile);
  });

  console.log(`MCP server is running on ${host}:${port}`);
  console.log('Press Ctrl+C to stop');

  // Keep running until interrupted
  await new Promise(() => {});
}

// ────────────────────────────────────────────────────────
// Run Request Command
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
      include: opts.include
    });
    outputResult(result, opts.output);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Run Collection Command
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
      stopOnError: opts.stopOnError,
      delay: opts.delay,
      include: opts.include
    });
    outputResult(result, opts.output);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Run Folder Command
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
      stopOnError: opts.stopOnError,
      delay: opts.delay,
      include: opts.include
    });
    outputResult(result, opts.output);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Run Suite Command
// ────────────────────────────────────────────────────────

export async function handleRunSuite(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);
  const restore = installStdoutGuard();

  if (!opts.suite) {
    console.error('Error: --suite is required');
    process.exit(2);
  }

  try {
    const result = await runSuite({
      workspaceFolder: opts.workspace,
      suiteId: opts.suite,
      environment: opts.environment,
      variables: opts.variables,
      iterations: opts.iterations,
      stopOnError: opts.stopOnError,
      delay: opts.delay,
      requestFilter: opts.requestFilter,
      include: opts.include
    });
    outputResult(result, opts.output);
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(2);
  } finally {
    restore();
  }
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

interface ParsedArgs {
  workspace: string;
  collection?: string;
  request?: string;
  suite?: string;
  folder?: string;
  recursive: boolean;
  environment?: string;
  variables: Record<string, unknown>;
  iterations?: number;
  stopOnError: boolean;
  delay?: number;
  requestFilter?: string[];
  include: string[];
  output: 'json' | 'table';
}

function parseArgs(args: string[]): ParsedArgs {
  const opts: ParsedArgs = {
    workspace: process.cwd(),
    recursive: true,
    variables: {},
    stopOnError: false,
    include: [],
    output: 'json'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--workspace' && i + 1 < args.length) {
      opts.workspace = args[++i];
    } else if (arg === '--collection' && i + 1 < args.length) {
      opts.collection = args[++i];
    } else if (arg === '--request' && i + 1 < args.length) {
      opts.request = args[++i];
    } else if (arg === '--suite' && i + 1 < args.length) {
      opts.suite = args[++i];
    } else if (arg === '--folder' && i + 1 < args.length) {
      opts.folder = args[++i];
    } else if (arg === '--recursive' && i + 1 < args.length) {
      opts.recursive = args[++i] !== 'false';
    } else if (arg === '--no-recursive') {
      opts.recursive = false;
    } else if (arg === '--environment' && i + 1 < args.length) {
      opts.environment = args[++i];
    } else if (arg === '--iterations' && i + 1 < args.length) {
      opts.iterations = parseInt(args[++i], 10);
    } else if (arg === '--stop-on-error') {
      opts.stopOnError = true;
    } else if (arg === '--delay' && i + 1 < args.length) {
      opts.delay = parseInt(args[++i], 10);
    } else if (arg === '--include' && i + 1 < args.length) {
      opts.include.push(args[++i]);
    } else if (arg === '--output' && i + 1 < args.length) {
      const out = args[++i];
      if (out === 'json' || out === 'table') {
        opts.output = out;
      }
    } else if (arg === '--var' && i + 1 < args.length) {
      const pair = args[++i];
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        const key = pair.slice(0, eqIdx);
        const value = pair.slice(eqIdx + 1);
        opts.variables[key] = value;
      }
    }
  }

  return opts;
}

/**
 * Merge process.env into variables at lowest priority.
 * Explicit --var flags (already in opts.variables) take precedence.
 */
function mergeProcessEnv(opts: ParsedArgs): void {
  opts.variables = { ...process.env, ...opts.variables };
}

/**
 * Print how a reference (collection/folder/request) was resolved to stderr so
 * resolution is transparent and visible in script logs. Goes to stderr to keep
 * stdout reserved for the JSON/table result.
 */
function logResolution(info: ResolutionInfo): void {
  if (info.kind === 'folder') {
    console.error(`Resolved --folder "${info.value}" -> ${info.id}`);
    return;
  }
  const loc = info.path ? ` (${info.path})` : '';
  console.error(`Resolved --${info.kind} "${info.value}" by ${info.tier} -> ${info.id}${loc}`);
}

/**
 * Guard stdout so it carries ONLY the machine-readable result.
 *
 * Core and its dependencies emit diagnostics through `console.log` (e.g. the
 * module loader, notification adapter, HTTP client). `console.log` writes to
 * stdout, which would corrupt JSON output that callers pipe/parse. While a run
 * is in progress we route `console.log`/`console.info` to stderr; the result is
 * written separately via `process.stdout.write` in {@link outputResult}.
 *
 * @returns a restore function that reinstates the original console methods.
 */
function installStdoutGuard(): () => void {
  const originalLog = console.log;
  const originalInfo = console.info;
  console.log = (...args: unknown[]): void => console.error(...args);
  console.info = (...args: unknown[]): void => console.error(...args);
  return () => {
    console.log = originalLog;
    console.info = originalInfo;
  };
}

function outputResult(result: unknown, format: 'json' | 'table'): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    // Table format for human readability
    process.stdout.write(`Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}\n`);
  }
}
