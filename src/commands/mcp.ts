/**
 * MCP server management commands.
 *
 * Handles both the legacy `mcp-server` command and the new `mcp` command group:
 *   http-forge mcp-server start --port 3100
 *   http-forge mcp start --port 3100       ← new shorter alias
 *   http-forge mcp stop
 *   http-forge mcp status
 */

import { createMcpRuntime } from '@http-forge/core';
import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────
// State persistence (written to .http-forge-cache/)
// ────────────────────────────────────────────────────────

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
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as McpServerState;
  } catch {
    return null;
  }
}

function removeMcpState(filePath: string): void {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
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
// Command handlers
// ────────────────────────────────────────────────────────

/**
 * http-forge mcp-server [start|stop|status] [--port N] [--host H] [--workspace P]
 * http-forge mcp       [start|stop|status] [--port N] [--host H] [--workspace P]
 */
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
    console.log(
      `MCP server is running:\n  PID: ${state.pid}\n  Host: ${state.host}\n` +
      `  Port: ${state.port}\n  Workspace: ${state.workspace}\n  Started: ${state.startedAt}`
    );
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
    if (isPidAlive(state.pid)) process.kill(state.pid, 'SIGKILL');
    removeMcpState(stateFile);
    console.log(`MCP server stopped (PID ${state.pid}).`);
    return;
  }

  // action === 'start'
  const existingState = readMcpState(stateFile);
  if (existingState && isPidAlive(existingState.pid)) {
    console.error(
      `MCP server already running on ${existingState.host}:${existingState.port} (PID ${existingState.pid}).`
    );
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
    startedAt: new Date().toISOString(),
  });

  const shutdown = async (): Promise<void> => {
    try { await runtime.stop(); } finally { removeMcpState(stateFile); }
  };

  process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });
  process.on('exit', () => { removeMcpState(stateFile); });

  console.log(`MCP server is running on ${host}:${port}`);
  console.log('Press Ctrl+C to stop');

  await new Promise(() => {});
}

/**
 * `http-forge mcp <action> [options]` — shorter alias for `http-forge mcp-server`.
 */
export async function handleMcpGroup(args: string[]): Promise<void> {
  if (!args[0] || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: http-forge mcp <action> [options]

Actions:
  start    Start MCP server (default)
  stop     Stop MCP server for the workspace
  status   Show MCP server status

Options:
  --port <num>        Port to listen on (default: 3100)
  --host <addr>       Host to bind to (default: 127.0.0.1)
  --workspace <path>  Workspace folder (default: current directory)

Examples:
  http-forge mcp start --port 3100 --workspace /path/to/project
  http-forge mcp status
  http-forge mcp stop
`);
    return;
  }
  await handleMcpServer(args);
}
