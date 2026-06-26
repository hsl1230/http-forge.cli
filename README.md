# HTTP Forge CLI

Command-line interface for executing HTTP Forge collections, test suites, and MCP server operations — with built-in CI/CD support including JUnit and HTML reports.

## Table of Contents

- [Installation](#installation)
- [Commands](#commands)
  - [run-request](#1-run-a-single-request)
  - [run-collection](#2-run-a-collection)
  - [run-folder](#3-run-a-folder)
  - [run-suite](#4-run-a-test-suite)
  - [mcp-server](#5-manage-mcp-server)
- [Reporters](#reporters)
- [CI/CD Integration](#cicd-integration)
- [Variables & Secrets](#variables--secrets)
- [Exit Codes](#exit-codes)
- [Output Format](#output-format)

---

## Installation

```bash
npm install --global @http-forge/cli
```

Or use directly from the monorepo:

```bash
cd http-forge.cli
npm install
npm run build
```

---

## Commands

### 1. Run a Single Request

```bash
http-forge run-request \
  --collection my-api \
  --request get-users \
  --environment production
```

**Required:**
- `--collection <ref>` — Collection id, slug, or display name
- `--request <ref>` — Request id, slug, or display name

**Optional:**
- `--folder <path>` — Scope resolution to a sub-folder (slash-separated)
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to activate
- `--var <KEY=VALUE>` — Override a variable (repeatable; highest priority)
- `--include <field>` — Extra response fields: `headers`, `cookies`, `tests`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` (default) or `table`

### 2. Run a Collection

```bash
http-forge run-collection \
  --collection my-api \
  --environment dev \
  --include perRequest
```

**Required:**
- `--collection <ref>` — Collection id, slug, or display name

**Optional:**
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to activate
- `--var <KEY=VALUE>` — Override a variable (repeatable)
- `--iterations <num>` — Number of iterations (default: 1)
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests in milliseconds
- `--include <field>` — Extra fields: `perRequest`, `failedOnly`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` or `table`

### 3. Run a Folder

Run all requests under a specific folder within a collection.

```bash
http-forge run-folder \
  --collection my-api \
  --folder "Auth/Login" \
  --environment staging
```

**Required:**
- `--collection <ref>` — Collection id, slug, or display name
- `--folder <path>` — Slash-separated folder path (e.g. `"Auth/Login"`)

**Optional:**
- `--no-recursive` — Run only the direct children of the folder (default includes sub-folders)
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to activate
- `--var <KEY=VALUE>` — Override a variable (repeatable)
- `--iterations <num>` — Number of iterations (default: 1)
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests in milliseconds
- `--include <field>` — Extra fields: `perRequest`, `failedOnly`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` or `table`

### 4. Run a Test Suite

```bash
http-forge run-suite \
  --suite smoke-tests \
  --environment staging \
  --reporter junit:results/junit.xml \
  --exit-code
```

**Required:**
- `--suite <id>` — Suite ID

**Optional:**
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to activate
- `--var <KEY=VALUE>` — Override a variable (repeatable)
- `--iterations <num>` — Number of iterations
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests in milliseconds
- `--include <field>` — Extra fields: `perRequest`, `failedOnly`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` or `table`

### 5. Manage MCP Server

Start, stop, or check the status of an embedded MCP (Model Context Protocol) server for AI agent integration:

```bash
http-forge mcp-server start --port 3100
http-forge mcp-server status --workspace .
http-forge mcp-server stop --workspace .
```

**Actions:** `start` | `stop` | `status`

**Options:**
- `--port <num>` — Port to listen on (default: 3100)
- `--host <addr>` — Host to bind to (default: 127.0.0.1)
- `--workspace <path>` — Workspace folder (default: current directory)

---

## Reporters

Reporters generate machine-readable or human-readable files from a run. Pass `--reporter` once per format; use the `name:path` syntax to set an explicit output path.

| Spec | Effect |
|---|---|
| `--reporter html` | HTML report to the default cache location |
| `--reporter html:reports/run.html` | HTML report copied to `reports/run.html` |
| `--reporter junit` | JUnit XML to the default cache location |
| `--reporter junit:results/junit.xml` | JUnit XML copied to `results/junit.xml` |

Reporters are **composable** — pass multiple to produce all formats in one run:

```bash
http-forge run-suite --suite smoke-tests \
  --reporter html:reports/run.html \
  --reporter junit:results/junit.xml \
  --exit-code
```

**Notes:**
- HTML reports require successful requests to produce content. Use `--reporter html` or the legacy `--include report` / `HTTP_FORGE_GENERATE_REPORTS=true` env var.
- JUnit XML is always produced when `--reporter junit` is set, even for runs with all failures (so CI tools can parse and display the failures).
- `--out <path>` is a deprecated alias for `--reporter junit:<path>` and still works but prints a warning.

---

## CI/CD Integration

> For a complete step-by-step guide with examples for GitHub Actions, Docker, and bare npm, see **[docs/ci-guide.md](docs/ci-guide.md)**.

### Quick start — GitHub Actions

```yaml
- name: Run API tests
  run: |
    http-forge run-suite \
      --workspace ./http-forge-assets \
      --suite smoke-tests \
      --environment staging \
      --reporter junit:test-results/junit.xml \
      --exit-code
  env:
    API_KEY: ${{ secrets.API_KEY }}

- name: Upload results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: api-test-results
    path: test-results/junit.xml
```

### Using the composite action

```yaml
- uses: http-forge/http-forge.cli@main
  with:
    suite: smoke-tests
    workspace: ./http-forge-assets
    environment: staging
    reporters: 'junit:test-results/junit.xml'
    extra_args: '--var API_KEY=${{ secrets.API_KEY }}'
```

### Using Docker

```bash
docker run --rm \
  -v "$PWD/http-forge-assets:/workspace" \
  -v "$PWD/results:/results" \
  ghcr.io/http-forge/cli:latest \
  run-suite --suite smoke-tests \
    --reporter junit:/results/junit.xml \
    --exit-code
```

---

## Variables & Secrets

**Priority (highest → lowest):**
1. `--var KEY=VALUE` CLI flags
2. `process.env` (CI env vars, shell exports)
3. `<env>.local.json` credential overrides (gitignored)
4. `<env>.json` environment file
5. `_global.json` / `_global.local.json` globals

**Injecting secrets at runtime:**

```bash
http-forge run-suite \
  --suite smoke-tests \
  --var API_KEY=$CI_API_KEY \
  --var BASE_URL=https://staging.example.com
```

**Secret providers** — reference secrets from AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, HashiCorp Vault, 1Password, or Doppler using `{{secret:alias/path}}`. Credentials come from the environment (env vars, cloud identity, CLI session) — never hardcoded.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success — all assertions passed (or `--exit-code` not set) |
| `1` | Test failures — one or more assertions failed (only when `--exit-code` is set) |
| `2` | Invalid arguments, missing required options, or runtime error |

---

## Output Format

### JSON (default)

```json
{
  "suite": "Smoke Tests",
  "environment": "staging",
  "summary": {
    "total": 12,
    "passed": 11,
    "failed": 1,
    "allPassed": false
  },
  "failedRequests": [
    {
      "name": "Create Order",
      "status": 500,
      "duration": "312ms",
      "failedTests": [{ "name": "Status is 201", "message": "expected 500 to equal 201" }]
    }
  ],
  "junitReport": { "path": "/tmp/.http-forge-cache/results/smoke-tests/run-20260626-141501/junit.xml" }
}
```

### Table

```
Result: { suite: 'Smoke Tests', summary: { total: 12, passed: 11, failed: 1 } }
```

---

## MCP Server — JSON-RPC Usage

After starting the server with `http-forge mcp-server start`, call `POST /`.

```bash
# Initialize
curl -X POST http://127.0.0.1:3100 \
  -H "Content-Type: application/json" \
  -d '{ "jsonrpc":"2.0","id":1,"method":"initialize" }'

# List tools
curl -X POST http://127.0.0.1:3100 \
  -H "Content-Type: application/json" \
  -d '{ "jsonrpc":"2.0","id":2,"method":"tools/list" }'

# Call a tool
curl -X POST http://127.0.0.1:3100 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{
      "name":"run_request",
      "arguments":{ "collection":"my-api","request":"get-users","environment":"dev" }
    }
  }'

# Health check
curl http://127.0.0.1:3100/health
```

---

## Architecture

The CLI delegates to `@http-forge/core` direct execution APIs. The service container bootstraps Node.js-specific adapters (file I/O, secrets). Output is formatted to JSON or table. All errors go to stderr; the machine-readable result goes to stdout only.

See [@http-forge/core README](../http-forge.core/README.md) for the full API reference.


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
