# HTTP Forge CLI

Command-line interface for executing HTTP Forge collections, test suites, and MCP server operations.

## Installation

```bash
cd http-forge.cli
npm install
npm run build
```

## Usage

### 1. Show Help

```bash
http-forge --help
http-forge -h
```

### 2. Run a Single Request

```bash
http-forge run-request \
  --collection my-api \
  --request get-users \
  --environment production \
  --output json
```

```bash
http-forge run-request --collection my-api --request get-users --include tests --include report
```

**Required:**
- `--collection <id>` — Collection ID
- `--request <id>` — Request ID

**Optional:**
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to use
- `--var <KEY=VALUE>` — Override a variable (repeatable; takes highest priority)
- `--include <field>` — Include extra fields (repeatable): `headers`, `cookies`, `tests`, `consoleOutput`, `report`
- `--output <fmt>` — Output format: `json` or `table` (default: `json`)

### 3. Run a Collection

```bash
http-forge run-collection \
  --collection my-api \
  --environment dev \
  --include perRequest \
  --output json
```

**Required:**
- `--collection <id>` — Collection ID

**Optional:**
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to use
- `--var <KEY=VALUE>` — Override a variable (repeatable; takes highest priority)
- `--iterations <num>` — Number of iterations (default: 1)
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests (milliseconds)
- `--include <field>` — Include extra fields (repeatable): `perRequest`, `failedOnly`, `consoleOutput`, `report`
- `--output <fmt>` — Output format: `json` or `table` (default: `json`)

### 4. Run a Test Suite

```bash
http-forge run-suite \
  --suite smoke-tests \
  --iterations 3 \
  --include failedOnly \
  --include report \
  --output json
```

**Required:**
- `--suite <id>` — Suite ID

**Optional:**
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to use
- `--var <KEY=VALUE>` — Override a variable (repeatable; takes highest priority)
- `--iterations <num>` — Number of iterations
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests (milliseconds)
- `--include <field>` — Include extra fields (repeatable): `perRequest`, `failedOnly`, `consoleOutput`, `report`
- `--output <fmt>` — Output format: `json` or `table` (default: `json`)

### 5. Manage MCP Server

Start, stop, or check the status of an embedded MCP (Model Context Protocol) server for AI agent integration:

```bash
http-forge mcp-server start --port 3100
http-forge mcp-server status --workspace .
http-forge mcp-server stop --workspace .
```

**Actions:**
- `start` — Start MCP server (default)
- `stop` — Stop MCP server for the workspace
- `status` — Show MCP server status for the workspace

**Options:**
- `--port <num>` — Port to listen on (default: 3100)
- `--host <addr>` — Host to bind to (default: 127.0.0.1)
- `--workspace <path>` — Workspace folder (default: current directory)

### MCP JSON-RPC Usage

After starting the server with `http-forge mcp-server start`, call the MCP endpoint at `POST /`.

JSON-RPC request shape:

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}
```

#### Initialize

```bash
curl -X POST http://127.0.0.1:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {}
  }'
```

#### List tools

```bash
curl -X POST http://127.0.0.1:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

#### Call a tool

```bash
curl -X POST http://127.0.0.1:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "request__my-api__get-users",
      "arguments": {
        "environment": "dev",
        "include": ["tests", "report"]
      }
    }
  }'
```

#### Health check

```bash
curl http://127.0.0.1:3100/health
```

#### Legacy compatibility endpoint

For non-MCP clients, a compatibility endpoint is also available:

```bash
curl -X POST http://127.0.0.1:3100/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "request__my-api__get-users",
    "args": { "environment": "dev" }
  }'
```

Common JSON-RPC error codes:
- `-32700` Parse error (invalid JSON)
- `-32603` Internal error (dispatch/runtime failures, including unknown method)

## Exit Codes

- `0` — Success
- `1` — Execution error (request failed, assertions failed, etc.)
- `2` — Invalid arguments or missing required options

## Environment Variables

- `HTTP_FORGE_WORKSPACE` — Override default workspace folder

> **Variable priority (highest → lowest)**
> 1. `--var KEY=VALUE` flags on the command line
> 2. `process.env` (CI environment variables, shell exports)
> 3. `<env>.local.json` credential overrides (gitignored)
> 4. `<env>.json` environment file values
> 5. `_global.json` / `_global.local.json` globals

## Secret Providers

Reference secrets from AWS Secrets Manager, Azure Key Vault, Google Secret Manager, HashiCorp Vault, 1Password, or Doppler directly in requests using `{{secret:alias/path}}`. Credentials come from the environment (env vars, cloud identity, CLI session) — never from config. Install the relevant cloud SDK (`optionalDependencies`) for AWS/Azure/GCP; Vault/Doppler/1Password need none.

See the [Secret Providers guide](https://github.com/hsl1230/http-forge/blob/main/docs/user-guide/secret-providers.md) for setup, configuration, and CI/CD usage.

## Examples

### Run smoke tests on staging

```bash
http-forge run-suite \
  --suite smoke-tests \
  --environment staging \
  --stop-on-error
```

### Override variables at runtime

```bash
# Inject a single variable
http-forge run-request \
  --collection my-api \
  --request create-user \
  --var BASE_URL=https://api.staging.example.com \
  --var API_KEY=my-secret-key

# Multiple --var flags are supported
http-forge run-suite \
  --suite smoke-tests \
  --environment prod \
  --var TIMEOUT=30000 \
  --var RETRY_COUNT=3
```

### GitHub Actions / CI integration

Variables from the shell environment are automatically available as template variables in your requests:

```yaml
- name: Run API tests
  run: |
    http-forge run-suite \
      --suite smoke-tests \
      --environment staging \
      --stop-on-error \
      --include report \
      --output json
  env:
    API_KEY: ${{ secrets.API_KEY }}
    BASE_URL: ${{ vars.STAGING_BASE_URL }}
```

You can also pass secrets explicitly with `--var` to override environment file values:

```yaml
- name: Run integration tests
  run: |
    http-forge run-collection \
      --collection my-api \
      --environment prod \
      --var API_KEY=${{ secrets.PROD_API_KEY }} \
      --var DB_HOST=${{ secrets.DB_HOST }}
```

### Execute collection with custom variables

```bash
http-forge run-collection \
  --collection my-api \
  --environment dev \
  --var BASE_URL=http://localhost:3000
```

### Run same test 5 times with delays

```bash
http-forge run-collection \
  --collection my-api \
  --iterations 5 \
  --delay 1000 \
  --stop-on-error
```

### Get JSON output for scripting

```bash
http-forge run-request \
  --collection api \
  --request login \
  --output json | jq '.allPassed'
```

## Output Format

### JSON Format (default)

```json
{
  "request": "Get Users",
  "status": 200,
  "ok": true,
  "duration": "145ms",
  "allPassed": true,
  "assertions": [
    {
      "name": "Status is 200",
      "passed": true
    }
  ]
}
```

### Table Format

```
Request: Get Users
Status:  200
OK:      true
Time:    145ms
Tests:   ✅ All passed
```

## Error Handling

All errors are written to stderr with detailed messages:

```bash
$ http-forge run-request --collection missing --request test 2>&1
Error: Collection "missing" not found
```

## Testing

Run tests to verify CLI functionality:

```bash
npm test
```

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Clean

```bash
npm run clean
```

## Architecture

The CLI delegates to HTTP Forge Core APIs:
- **Direct Execution**: Uses `@http-forge/core` direct execution APIs
- **Service Container**: Bootstraps Node.js-specific adapters (file I/O, secrets, etc.)
- **Output Formatting**: Converts execution results to JSON or human-readable format
- **Error Handling**: Consistent exit codes and error messages

See [@http-forge/core README](../http-forge.core/README.md) for API documentation.
