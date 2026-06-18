/**
 * HTTP Forge CLI
 * 
 * Command-line interface for HTTP Forge runtime operations:
 * - mcp-server: Start MCP server
 * - run-request: Execute a single request
 * - run-collection: Execute a collection
 * - run-suite: Execute a test suite
 */

import {
    handleMcpServer,
    handleRunCollection,
    handleRunRequest,
    handleRunSuite
} from './commands';

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'mcp-server':
        await handleMcpServer(args.slice(1));
        break;

      case 'run-request':
        await handleRunRequest(args.slice(1));
        break;

      case 'run-collection':
        await handleRunCollection(args.slice(1));
        break;

      case 'run-suite':
        await handleRunSuite(args.slice(1));
        break;

      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(2);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
HTTP Forge CLI

USAGE:
  http-forge <command> [options]

COMMANDS:
  mcp-server <action>     Manage MCP server lifecycle
    Actions:
      start               Start MCP server (default action)
      stop                Stop MCP server for the workspace
      status              Show MCP server status for the workspace
    Options (for start/status/stop workspace scope):
      --port <num>        Port to listen on (default: 3100)
      --host <addr>       Host to bind to (default: 127.0.0.1)
      --workspace <path>  Workspace folder (default: current directory)

  run-request             Execute a single request
    Required:
      --collection <id>   Collection ID
      --request <id>      Request ID
    Optional:
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --include <field>   Include extra fields (repeatable):
                          headers, cookies, tests, consoleOutput, report
      --output <fmt>      Output format: json or table (default: json)

  run-collection          Execute a collection
    Required:
      --collection <id>   Collection ID
    Optional:
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --iterations <num>  Number of iterations (default: 1)
      --stop-on-error     Stop on first failure
      --delay <ms>        Delay between requests
      --include <field>   Include extra fields (repeatable):
                          perRequest, failedOnly, consoleOutput, report
      --output <fmt>      Output format: json or table (default: json)

  run-suite               Execute a test suite
    Required:
      --suite <id>        Suite ID
    Optional:
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --iterations <num>  Number of iterations
      --stop-on-error     Stop on first failure
      --delay <ms>        Delay between requests
      --include <field>   Include extra fields (repeatable):
                          perRequest, failedOnly, consoleOutput, report
      --output <fmt>      Output format: json or table (default: json)

EXAMPLES:
  http-forge mcp-server start --port 3100
  http-forge mcp-server status --workspace .
  http-forge mcp-server stop --workspace .
  http-forge run-request --collection my-api --request get-users
  http-forge run-request --collection my-api --request get-users --include tests --include report
  http-forge run-collection --collection my-api --environment dev --include perRequest
  http-forge run-suite --suite smoke-tests --iterations 3 --include failedOnly --include report --output json

OPTIONS:
  --help, -h              Show this help message
`);
}
