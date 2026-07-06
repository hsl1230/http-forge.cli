/**
 * HTTP Forge CLI
 *
 * Command-line interface for HTTP Forge runtime operations.
 *
 *   http-forge run collection <name>
 *   http-forge run suite <name>
 *   http-forge run request <name> --collection <ref>
 *   http-forge run folder <path> --collection <ref>
 *   http-forge mcp start --port 3100
 */

import {
  handleCopyAs,
  handleEnv,
  handleGenerateCollection,
  handleLaunch,
  handleList,
  handleMcpGroup,
  handleRunGroup,
  handleSchedule,
  handleSuggestEnv
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
      case 'mcp':
        await handleMcpGroup(args.slice(1));
        break;

      case 'run':
        await handleRunGroup(args.slice(1));
        break;

      case 'copy-as':
        await handleCopyAs(args.slice(1));
        break;

      case 'list':
        await handleList(args.slice(1));
        break;

      case 'env':
        await handleEnv(args.slice(1));
        break;

      case 'generate-collection':
        await handleGenerateCollection(args.slice(1));
        break;

      case 'suggest-env':
        await handleSuggestEnv(args.slice(1));
        break;

      case 'schedule':
        await handleSchedule(args.slice(1));
        break;

      case 'launch':
        await handleLaunch(args.slice(1));
        break;

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
  run <type> [name]       Execute requests
    Types:
      collection <name>   Run all requests in a collection
      suite <name>        Run a test suite (accepts name or id)
      request <name>      Run a single request (also needs --collection)
      folder <path>       Run requests under a folder (also needs --collection)
    Options:
      --env <name>        Environment (default: $HTTP_FORGE_ENV or dev)
      --environment <name> Same as --env (long form)
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
      --collection <ref>  Collection for 'request' and 'folder' types
      --folder <path>     Scope to a folder (for 'request'); slash-separated
      --no-recursive      Run only immediate children (for 'folder' type)
      --var <KEY=VALUE>   Override a variable (repeatable; highest priority)
      --iterations <num>  Number of iterations (default: 1)
      --concurrency <num> Parallel virtual users (default: 1)
      --stop-on-error     Stop on first failure
      --delay <ms>        Delay between requests in milliseconds
      --include <field>   Extra output fields (repeatable):
                            collection/suite/folder: perRequest, failedOnly, consoleOutput
                            request:                 headers, cookies, tests, consoleOutput
      --reporter <spec>   Generate a report (repeatable): html, junit, or name:path
                            --reporter html
                            --reporter junit:results/junit.xml
      --exit-code         Exit 1 when any assertion fails (for CI)
      --output <fmt>      Output format: json or table (default: json)
      --json              Short for --output json

  mcp <action>            Manage MCP server lifecycle
    Actions:
      start               Start MCP server
      stop                Stop MCP server
      status              Show MCP server status
    Options:
      --port <num>        Port to listen on (default: 3100)
      --host <addr>       Host to bind to (default: 127.0.0.1)
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)

  launch [options] [path] Launch HTTP Forge in VS Code
    Options:
      --test              Launch with isolated "HTTP Forge" profile (default)
      --dev               Launch with "Default" profile (all extensions)
      --both              Launch both profiles side by side
      --help              Show launcher help

  copy-as                 Print a request as a code snippet
    Required:
      --collection <ref>  Collection (id, slug, or name)
      --request <ref>     Request (id, slug, or name)
      --lang <name>       Target language: curl, fetch, python
    Optional:
      --folder <path>     Scope resolution to this folder
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
      --environment <name> Environment to resolve variables against

  list <subcommand>       List workspace resources
    Subcommands:
      collections         List all collections (id, name, request count)
      suites              List all test suites (id, name, request count)
      environments        List all environments (name, active, variable count)
      requests            List requests in a collection (requires --collection)
      folders             List folders in a collection (requires --collection)
    Options:
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
      --collection <ref>  Collection reference (required for 'requests' and 'folders')
      --folder <path>     Scope to a sub-folder (for 'requests' and 'folders')
      --output <fmt>      Output format: json or table (default: json)

  env <subcommand>        Manage environment variables
    Subcommands:
      list                List all environments (name, active, variable count)
      get <name>          Show all variables for an environment
      set <env> <k> <v>   Permanently write a variable to the env JSON file
      unset <env> <key>   Remove a variable from the env JSON file
    Options:
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
      --output <fmt>      Output format for list/get: json or table (default: json)
      --no-values         Omit values in 'get' (show only key names)

  generate-collection     Create a collection from a curl command, Postman file, or OpenAPI spec
    Sources (one required):
      --curl <cmd>        curl command string (quote the whole thing)
      --postman <file>    Postman Collection v2.x JSON file
      --openapi <file>    OpenAPI 3.0 spec file (.json / .yaml / .yml)
    Options:
      --name <name>       Collection name (default: derived from source)
      --env <name>        Write detected vars (curl) or create env (openapi) with this name
      --create-envs       openapi: create environments from server URLs
      --ai                Enhance collection with AI (needs OPENAI_API_KEY or ANTHROPIC_API_KEY)
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
      --output <fmt>      Output format: json or table (default: json)

  suggest-env             Detect hardcoded values and suggest environment variables
    Required:
      --collection <ref>  Collection name, slug, or id
    Options:
      --apply             Replace values in collection + write to environment
      --env <name>        Target environment for --apply (default: active env)
      --ai                Use AI detection (needs OPENAI_API_KEY or ANTHROPIC_API_KEY)
      --min-occurrences   Only suggest values in at least N requests (default: 1)
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
      --output <fmt>      Output format: json or table (default: json)

  schedule                Generate a CI schedule config for running a test suite
    Required:
      --suite <name>      Test suite name (or id/slug)
    Options:
      --env <name>        Environment to pass to the suite run
      --cron <expr>       Cron schedule expression (default: "0 */6 * * *")
      --output <path>     Output file path (default: .github/workflows/http-forge-<suite>.yml)
      --reporter <spec>   Reporter spec, e.g. "junit:results/junit.xml" (default: junit)
      --no-exit-code      Do not fail the job on assertion failures
      --format <type>     github-actions | cron | both (default: github-actions)
      --print-cron        Print cron entry to stdout (alias for --format cron)
      --workspace <path>  Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)

EXAMPLES:
  http-forge mcp start --port 3100
  http-forge mcp status
  http-forge mcp stop
  http-forge launch
  http-forge launch --dev
  http-forge launch --both /path/to/workspace
  http-forge run collection "my-api" --env dev
  http-forge run request "Get Users" --collection "my-api" --env production
  http-forge run request "Get Users" --collection "my-api" --folder Auth --include tests
  http-forge run collection "my-api" --env dev --include perRequest
  http-forge run collection "my-api" --env prod --var BASE_URL=https://api.example.com --var API_KEY=$API_KEY
  http-forge run folder "Auth/Login" --collection "my-api" --env dev --include perRequest
  http-forge run folder Users --collection "my-api" --no-recursive --include report
  http-forge run suite "smoke-tests" --iterations 3 --include failedOnly --output json
  http-forge run suite "smoke-tests" --env staging --var TOKEN=$CI_TOKEN
  http-forge run suite "smoke-tests" --reporter junit:results/junit.xml --exit-code
  http-forge run suite "smoke-tests" --reporter html --reporter junit:results/junit.xml --exit-code
  http-forge run suite "load-test" --concurrency 10 --iterations 5
  http-forge copy-as --collection my-api --request get-users --lang curl
  http-forge copy-as --collection my-api --request "Create User" --lang python
  http-forge list collections
  http-forge list suites --output table
  http-forge list environments --workspace /path/to/workspace
  http-forge list requests --collection my-api --output table
  http-forge list requests --collection my-api --folder Auth
  http-forge list folders --collection my-api
  http-forge env list
  http-forge env get staging
  http-forge env get staging --output table
  http-forge env set staging BASE_URL https://staging.example.com
  http-forge env set staging API_KEY=my-secret-key
  http-forge env unset staging OLD_VAR
  http-forge generate-collection --curl "curl https://api.example.com/users"
  http-forge generate-collection --curl "curl -X POST -H 'Authorization: Bearer sk-abc' https://api.example.com/v1/users -d '{\"name\":\"Alice\"}'" --env dev
  http-forge generate-collection --postman ./MyCollection.postman_collection.json
  http-forge generate-collection --openapi ./openapi.yaml --name "Payments API" --create-envs --env staging
  http-forge suggest-env --collection my-api --output table
  http-forge suggest-env --collection my-api --apply --env staging
  http-forge schedule --suite smoke-tests --env staging
  http-forge schedule --suite regression --env prod --cron "0 2 * * *" --format both

NOTES:
  Collection, request, and folder references accept an id, a slug, or a display
  name. Resolution tries id, then slug, then name, and stops at the first match.
  If a name matches multiple items, the command lists the candidates and exits
  non-zero — pass the id or slug to disambiguate.

  Set HTTP_FORGE_WORKSPACE and HTTP_FORGE_ENV in your shell profile to avoid
  repeating --workspace and --env on every command.

OPTIONS:
  --help, -h              Show this help message
`);
}
