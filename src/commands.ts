/**
 * CLI Command Handlers
 * 
 * Implementations of CLI commands that use the runtime APIs.
 */

import { createMcpRuntime, runCollection, runRequest, runSuite } from '@http-forge/core';
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

  if (!opts.collection || !opts.request) {
    console.error('Error: --collection and --request are required');
    process.exit(2);
  }

  const result = await runRequest({
    workspaceFolder: opts.workspace,
    collectionId: opts.collection,
    requestId: opts.request,
    environment: opts.environment,
    variables: opts.variables,
    include: opts.include
  });

  outputResult(result, opts.output);
}

// ────────────────────────────────────────────────────────
// Run Collection Command
// ────────────────────────────────────────────────────────

export async function handleRunCollection(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);

  if (!opts.collection) {
    console.error('Error: --collection is required');
    process.exit(2);
  }

  const result = await runCollection({
    workspaceFolder: opts.workspace,
    collectionId: opts.collection,
    environment: opts.environment,
    variables: opts.variables,
    iterations: opts.iterations,
    stopOnError: opts.stopOnError,
    delay: opts.delay,
    include: opts.include
  });

  outputResult(result, opts.output);
}

// ────────────────────────────────────────────────────────
// Run Suite Command
// ────────────────────────────────────────────────────────

export async function handleRunSuite(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  mergeProcessEnv(opts);

  if (!opts.suite) {
    console.error('Error: --suite is required');
    process.exit(2);
  }

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
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

interface ParsedArgs {
  workspace: string;
  collection?: string;
  request?: string;
  suite?: string;
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

function outputResult(result: unknown, format: 'json' | 'table'): void {
  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Table format for human readability
    console.log('Result:', result);
  }
}
