# HTTP Forge CLI

Command-line interface for executing HTTP Forge collections, test suites, and MCP server operations — with built-in CI/CD support including JUnit and HTML reports.

## Table of Contents

- [Installation](#installation)
- [Commands](#commands)
  - [launch](#launch-command)
  - [run](#run-command)
  - [generate-collection](#generate-collection)
  - [suggest-env](#suggest-env)
  - [schedule](#schedule)
  - [mcp](#5-manage-mcp-server)
  - [copy-as](#6-copy-as-code-snippet)
  - [list](#7-list-workspace-resources)
  - [env](#8-manage-environment-variables)
- [Reporters](#reporters)
- [CI/CD Integration](#cicd-integration)
- [Variables & Secrets](#variables--secrets)
- [Environment Variables](#environment-variables)
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

### `launch` command

Launch HTTP Forge in VS Code using a test profile, default profile, or both.

```bash
# Default: isolated "HTTP Forge" profile
http-forge launch

# Launch with your normal VS Code profile (all extensions)
http-forge launch --dev

# Launch both profiles side by side
http-forge launch --both

# Launch and open a specific workspace/folder
http-forge launch --dev /path/to/workspace
```

**Options:**
- `--test` — Launch with isolated `HTTP Forge` profile (default)
- `--dev` — Launch with `Default` profile (all your extensions)
- `--both` — Launch two instances: test + dev
- `--help` — Show launcher help

**Notes:**
- Shell/OS is detected automatically and the matching launcher is used (`http-forge.sh` on Linux/macOS, `http-forge.bat` on Windows).
- The launcher ensures the HTTP Forge extension is installed in the target profile before opening VS Code.

---

### `run` command

Execute requests using the positional form `http-forge run <type> <name>`:

```bash
# Run a collection by name
http-forge run collection "Auth Flow" --env staging

# Run a test suite by name or id
http-forge run suite "Regression" --env prod --stop-on-error --exit-code

# Run a single request (needs --collection)
http-forge run request "Login" --collection "Auth" --env dev

# Run all requests under a folder (needs --collection)
http-forge run folder "Auth/Login" --collection "Auth" --env dev
```

`--env` is a short form of `--environment`. Both default to `$HTTP_FORGE_ENV` when not set.

#### Path-based dispatch

You can also pass a workspace-relative **file path** instead of a type + name pair. HTTP Forge detects the run type from the target file:

```bash
# Run by pointing at the collection directory (contains collection.json)
http-forge run collections/auth-flow --env staging

# Run a specific suite file
http-forge run suites/regression.json --env prod --exit-code

# Run a folder — collection is resolved automatically from the ancestor collection.json
http-forge run collections/auth-flow/Login --env dev

# Run a single request — collection is resolved automatically
http-forge run collections/auth-flow/Login/get-token --env dev
```

| Target file found | Equivalent command |
|---|---|
| `suite.json` | `run suite <name>` |
| `collection.json` | `run collection <name>` |
| `folder.json` (or directory inside a collection) | `run folder <path>` |
| `request.json` | `run request <name>` |

Path-based dispatch is useful when navigating a workspace in a terminal — `cd` into a folder and pass its relative path directly.

---

### 1. `run request`

```bash
http-forge run request "get-users" \
  --collection my-api \
  --environment production
```

**Required:**
- `--collection <ref>` — Collection id, slug, or display name
- First positional arg — Request id, slug, or display name

**Optional:**
- `--folder <path>` — Scope resolution to a sub-folder (slash-separated)
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to activate
- `--var <KEY=VALUE>` — Override a variable (repeatable; highest priority)
- `--include <field>` — Extra response fields: `headers`, `cookies`, `tests`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` (default) or `table`

### 2. `run collection`

```bash
http-forge run collection my-api \
  --environment dev \
  --include perRequest
```

**Required:**
- First positional arg — Collection id, slug, or display name

**Optional:**
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--environment <name>` — Environment to activate (default: `$HTTP_FORGE_ENV`)
- `--env <name>` — Short form of `--environment`
- `--var <KEY=VALUE>` — Override a variable (repeatable)
- `--iterations <num>` — Number of iterations (default: 1)
- `--concurrency <num>` — Parallel virtual users (default: 1)
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests in milliseconds
- `--include <field>` — Extra fields: `perRequest`, `failedOnly`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` or `table`

### 3. `run folder`

Run all requests under a specific folder within a collection.

```bash
http-forge run folder "Auth/Login" \
  --collection my-api \
  --environment staging
```

**Required:**
- First positional arg — Folder path (slash-separated, e.g. `"Auth/Login"`)
- `--collection <ref>` — Collection id, slug, or display name

**Optional:**
- `--no-recursive` — Run only direct children of the folder (default includes sub-folders)
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--environment <name>` — Environment to activate (default: `$HTTP_FORGE_ENV`)
- `--env <name>` — Short form of `--environment`
- `--var <KEY=VALUE>` — Override a variable (repeatable)
- `--iterations <num>` — Number of iterations (default: 1)
- `--concurrency <num>` — Parallel virtual users (default: 1)
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests in milliseconds
- `--include <field>` — Extra fields: `perRequest`, `failedOnly`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` or `table`

```bash
http-forge run suite smoke-tests \
  --environment staging \
  --reporter junit:results/junit.xml \
  --exit-code
```

**Required:**
- First positional arg — Suite name or id (case-insensitive name matching supported)

**Optional:**
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--environment <name>` — Environment to activate (default: `$HTTP_FORGE_ENV`)
- `--env <name>` — Short form of `--environment`
- `--var <KEY=VALUE>` — Override a variable (repeatable)
- `--iterations <num>` — Number of iterations
- `--concurrency <num>` — Parallel virtual users (default: 1)
- `--stop-on-error` — Stop on first failure
- `--delay <ms>` — Delay between requests in milliseconds
- `--include <field>` — Extra fields: `perRequest`, `failedOnly`, `consoleOutput`
- `--reporter <spec>` — Generate a report (see [Reporters](#reporters))
- `--exit-code` — Exit 1 when any assertion fails
- `--output <fmt>` — `json` or `table`

---

### `generate-collection`

Create an HTTP Forge collection from a **curl command**, a **Postman Collection** export, or an **OpenAPI spec**. Optionally enhance the resulting collection with AI.

```bash
# From a curl command
http-forge generate-collection --curl "curl -X POST https://api.example.com/users \
  -H 'Authorization: Bearer sk-abc123' \
  -d '{\"name\":\"Alice\"}'" \
  --env dev

# From a Postman Collection v2.x export
http-forge generate-collection --postman ./MyApi.postman_collection.json

# From an OpenAPI spec — creates a collection and an environment from server URLs
http-forge generate-collection --openapi ./openapi.yaml \
  --name "Payments API" --create-envs --env staging

# Any source + AI enhancement (requires OPENAI_API_KEY or ANTHROPIC_API_KEY)
http-forge generate-collection --postman ./MyApi.postman_collection.json --ai
http-forge generate-collection --openapi ./openapi.yaml --create-envs --ai
```

**Sources (exactly one required):**
- `--curl <cmd>` — curl command string (quote the whole thing)
- `--postman <file>` — Postman Collection v2.x JSON file
- `--openapi <file>` — OpenAPI 3.0 spec (`.json`, `.yaml`, `.yml`)

**Options:**
- `--name <name>` — Collection name (default: derived from source)
- `--env <name>` — `curl`: write detected vars to this env · `openapi`: create env from server URLs
- `--create-envs` — `openapi`: create environments from all server URLs
- `--ai` — Enhance the collection with AI after import (writes realistic example bodies and `pm.test()` assertions).  
  Requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Override model via `OPENAI_MODEL` / `ANTHROPIC_MODEL`. Force provider with `HTTP_FORGE_AI_PROVIDER=openai|anthropic`.
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--output json|table` — Output format (default: `json`)

---

### `suggest-env`

Scan a collection for hardcoded values (API keys, base URLs, tokens, IDs) and suggest replacing them with `{{ENV_VAR}}` placeholders. Runs dry-run by default; add `--apply` to write changes.

```bash
# Dry-run (heuristic rules) — see what would be replaced
http-forge suggest-env --collection my-api --output table

# Dry-run with AI detection (better recall for complex collections)
OPENAI_API_KEY=sk-... http-forge suggest-env --collection my-api --ai --output table

# Apply: replace in collection and write original values to "staging" env
http-forge suggest-env --collection my-api --apply --env staging

# Apply with AI detection
http-forge suggest-env --collection my-api --ai --apply --env staging

# Only flag values appearing in 3+ requests
http-forge suggest-env --collection my-api --min-occurrences 3 --output table
```

**Required:**
- `--collection <ref>` — Collection name, slug, or id

**Options:**
- `--apply` — Replace hardcoded values in the collection and write originals to the target env
- `--env <name>` — Target environment for `--apply` (default: active env)
- `--ai` — Use AI for detection instead of heuristic rules.  
  Requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Ignores `--min-occurrences` (AI determines relevance).
- `--min-occurrences <n>` — Only suggest values appearing in ≥ N request locations (default: 1; heuristic mode only)
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--output json|table` — Output format (default: `json`)

---

### `schedule`

Generate a CI schedule configuration for running an HTTP Forge suite automatically. Outputs a **GitHub Actions workflow** file, a **cron entry**, or both — no daemon required.

```bash
# GitHub Actions workflow (default) — runs on push + every 6 hours
http-forge schedule --suite smoke-tests --env staging

# Custom cron schedule and output path
http-forge schedule --suite regression --env prod \
  --cron "0 2 * * *" --output .github/workflows/nightly.yml

# Generate both a GitHub Actions workflow and a cron entry
http-forge schedule --suite smoke-tests --env staging --format both

# Print a cron entry only (no file written)
http-forge schedule --suite smoke-tests --print-cron

# Custom reporter path
http-forge schedule --suite e2e --reporter "junit:test-results/e2e.xml"
```

**Required:**
- `--suite <name>` — Test suite name, slug, or id

**Options:**
- `--env <name>` — Environment to pass to the suite run
- `--cron <expr>` — Cron schedule expression (default: `"0 */6 * * *"` — every 6 hours)
- `--output <path>` — Output file path (default: `.github/workflows/http-forge-<suite>.yml`)
- `--reporter <spec>` — Reporter spec, e.g. `junit:results/junit.xml` (default: `junit`)
- `--no-exit-code` — Do not fail the CI job on assertion failures
- `--format github-actions|cron|both` — Output format (default: `github-actions`)
- `--print-cron` — Print a cron entry to stdout (alias for `--format cron`)
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)

The generated GitHub Actions workflow includes: Node 20 setup, `npm install -g @http-forge/cli`, the run step with configurable reporter and exit-code gate, artifact upload (30-day retention), and an optional JUnit publish step.

---

### 5. Manage MCP Server

Start, stop, or check the status of an embedded MCP (Model Context Protocol) server for AI agent integration:

```bash
http-forge mcp start --port 3100
http-forge mcp status
http-forge mcp stop
```

**Actions:** `start` | `stop` | `status`

**Options:**
- `--port <num>` — Port to listen on (default: 3100)
- `--host <addr>` — Host to bind to (default: 127.0.0.1)
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)

---

### 6. Copy-as Code Snippet

Generate a ready-to-run code snippet for a request in cURL, JavaScript fetch, or Python:

```bash
http-forge copy-as \
  --collection my-api \
  --request get-users \
  --lang curl

http-forge copy-as \
  --collection my-api \
  --request "Create User" \
  --lang python \
  --environment staging
```

**Required:**
- `--collection <ref>` — Collection id, slug, or display name
- `--request <ref>` — Request id, slug, or display name
- `--lang <name>` — Target language: `curl`, `fetch`, `python`

**Optional:**
- `--folder <path>` — Scope resolution to a sub-folder
- `--workspace <path>` — Workspace folder (default: current directory)
- `--environment <name>` — Environment to resolve variables against

---

### 7. List Workspace Resources

Inspect collections, suites, environments, and requests without starting a run:

```bash
http-forge list collections
http-forge list suites --output table
http-forge list environments --workspace /path/to/project
http-forge list requests --collection my-api
http-forge list requests --collection my-api --folder Auth --output table
http-forge list folders --collection my-api
http-forge list folders --collection my-api --folder Auth
```

**Subcommands:** `collections` | `suites` | `environments` | `requests` | `folders`

**Options:**
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--collection <ref>` — Required for `requests` and `folders` subcommands
- `--folder <path>` — Scope to a sub-folder (for `requests` and `folders`)
- `--output <fmt>` — `json` (default) or `table`

---

### 8. Manage Environment Variables

Read and write environment variables stored in the workspace config files:

```bash
# List all environments
http-forge env list

# Inspect a specific environment
http-forge env get staging
http-forge env env get staging --output table
http-forge env get staging --no-values   # show keys only

# Set a variable permanently (writes to the JSON env file)
http-forge env set staging BASE_URL https://staging.example.com
http-forge env set staging API_KEY=my-secret-key   # key=value syntax

# Remove a variable
http-forge env unset staging OLD_VAR
```

**Subcommands:** `list` | `get <name>` | `set <env> <key> <value>` | `unset <env> <key>`

**Options:**
- `--workspace <path>` — Workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)
- `--output <fmt>` — `json` (default) or `table` (for `list` and `get`)
- `--no-values` — Show only key names, not values (for `get`)

> **Note:** `env set` writes permanently to the env JSON file on disk. Changes are picked up immediately by subsequent CLI runs in the same workspace.
>
> To set the active environment for a session, use the `HTTP_FORGE_ENV` environment variable instead of a CLI subcommand (e.g. `export HTTP_FORGE_ENV=staging`).

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
http-forge run suite smoke-tests \
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
>
> For **AI-driven failure analysis** (Claude automatically diagnoses failures and posts results as a PR comment), see [Option E — AI-driven analysis](docs/ci-guide.md#option-e--ai-driven-analysis-mcp--claude) in the CI guide.

### Quick start — GitHub Actions

```yaml
- name: Run API tests
  run: |
    http-forge run suite smoke-tests \
      --workspace ./http-forge-assets \
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
  run suite smoke-tests \
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
http-forge run suite smoke-tests \
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

After starting the server with `http-forge mcp start`, call `POST /`.

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

