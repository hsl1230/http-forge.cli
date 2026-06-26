/**
 * HTTP Forge CLI
 * 
 * Command-line interface for HTTP Forge runtime operations:
 * - mcp-server: Start MCP server
 * - run-request: Execute a single request
 * - run-collection: Execute a collection
 * - run-folder: Execute a folder within a collection
 * - run-suite: Execute a test suite
 */

import {
    handleMcpServer,
    handleRunCollection,
    handleRunFolder,
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

      case 'run-folder':
        await handleRunFolder(args.slice(1));
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
      --collection <ref>  Collection (id, slug, or name)
      --request <ref>     Request (id, slug, or name)
    Optional:
      --folder <path>     Scope request resolution to this folder
                          (slash path of id/slug/name segments)
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --var <KEY=VALUE>   Override a variable (repeatable; highest priority)
      --include <field>   Include extra fields (repeatable):
                          headers, cookies, tests, consoleOutput, report
      --reporter <spec>   Generate a report (repeatable). Format: <name> or <name>:<path>
                          Supported names: html, junit
                          Examples: --reporter html
                                    --reporter junit:results/junit.xml
                                    --reporter html --reporter junit:results/junit.xml
      --exit-code         Exit non-zero (1) when any assertion fails (for CI)
      --output <fmt>      Output format: json or table (default: json)

  run-collection          Execute a collection
    Required:
      --collection <ref>  Collection (id, slug, or name)
    Optional:
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --var <KEY=VALUE>   Override a variable (repeatable; highest priority)
      --iterations <num>  Number of iterations (default: 1)
      --stop-on-error     Stop on first failure
      --delay <ms>        Delay between requests
      --include <field>   Include extra fields (repeatable):
                          perRequest, failedOnly, consoleOutput, report
      --reporter <spec>   Generate a report (repeatable). Format: <name> or <name>:<path>
                          Supported names: html, junit
      --exit-code         Exit non-zero (1) when any assertion fails (for CI)
      --output <fmt>      Output format: json or table (default: json)

  run-folder              Execute the requests under a collection folder
    Required:
      --collection <ref>  Collection (id, slug, or name)
      --folder <path>     Folder path (slash-separated id/slug/name segments,
                          e.g. "Auth/Login")
    Optional:
      --recursive <bool>  Include nested subfolders (default: true);
                          use --no-recursive for this level only
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --var <KEY=VALUE>   Override a variable (repeatable; highest priority)
      --iterations <num>  Number of iterations (default: 1)
      --stop-on-error     Stop on first failure
      --delay <ms>        Delay between requests
      --include <field>   Include extra fields (repeatable):
                          perRequest, failedOnly, consoleOutput, report
      --reporter <spec>   Generate a report (repeatable). Format: <name> or <name>:<path>
                          Supported names: html, junit
      --exit-code         Exit non-zero (1) when any assertion fails (for CI)
      --output <fmt>      Output format: json or table (default: json)

  run-suite               Execute a test suite
    Required:
      --suite <id>        Suite ID
    Optional:
      --workspace <path>  Workspace folder (default: current directory)
      --environment <name> Environment to use
      --var <KEY=VALUE>   Override a variable (repeatable; highest priority)
      --iterations <num>  Number of iterations
      --stop-on-error     Stop on first failure
      --delay <ms>        Delay between requests
      --include <field>   Include extra fields (repeatable):
                          perRequest, failedOnly, consoleOutput, report
      --reporter <spec>   Generate a report (repeatable). Format: <name> or <name>:<path>
                          Supported names: html, junit
      --exit-code         Exit non-zero (1) when any assertion fails (for CI)
      --output <fmt>      Output format: json or table (default: json)

EXAMPLES:
  http-forge mcp-server start --port 3100
  http-forge mcp-server status --workspace .
  http-forge mcp-server stop --workspace .
  http-forge run-request --collection my-api --request get-users
  http-forge run-request --collection my-api --request "Get Users" --folder Auth
  http-forge run-request --collection my-api --request get-users --include tests --include report
  http-forge run-collection --collection my-api --environment dev --include perRequest
  http-forge run-collection --collection my-api --environment prod --var BASE_URL=https://api.example.com --var API_KEY=$API_KEY
  http-forge run-folder --collection my-api --folder "Auth/Login" --environment dev --include perRequest
  http-forge run-folder --collection my-api --folder Users --no-recursive --include report
  http-forge run-suite --suite smoke-tests --iterations 3 --include failedOnly --output json
  http-forge run-suite --suite smoke-tests --environment staging --var TOKEN=$CI_TOKEN
  http-forge run-suite --suite smoke-tests --reporter junit:results/junit.xml --exit-code
  http-forge run-suite --suite smoke-tests --reporter html --reporter junit:results/junit.xml --exit-code

NOTES:
  --collection, --request, and each --folder segment accept an id, a slug, or a
  display name. Resolution tries id, then slug, then name, and stops at the
  first match. If a name matches multiple items, the command lists the
  candidates and exits non-zero — pass the id or slug to disambiguate. How each
  value resolved is printed to stderr.

OPTIONS:
  --help, -h              Show this help message
`);
}
