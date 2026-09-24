<div align="center">

<a href="https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge">
<img src="https://raw.githubusercontent.com/hsl1230/http-forge/main/resources/http-forge-icon.png" alt="HTTP Forge" width="120"/>
</a>

</div>

# HTTP Forge CLI

[![npm version](https://img.shields.io/npm/v/%40http-forge%2Fcli)](https://www.npmjs.com/package/@http-forge/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40http-forge%2Fcli)](https://www.npmjs.com/package/@http-forge/cli)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/henry-huang.http-forge?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge)
[![license](https://img.shields.io/npm/l/%40http-forge%2Fcli)](LICENSE)
[![node](https://img.shields.io/node/v/%40http-forge%2Fcli)](https://www.npmjs.com/package/@http-forge/cli)

The standalone launcher, terminal, and automation CLI for [HTTP Forge](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge).

Use it to launch HTTP Forge from terminal, run API collections and suites in CI/CD, manage MCP server lifecycle, and generate JUnit/HTML reports.

Built for Postman-compatible workflows: import Postman collections/environments and run them with Postman-style scripting and assertions.

For the full interactive experience, run `http-forge launch`.
The launcher ensures VS Code and the HTTP Forge extension are installed in the target profile before opening it.
Marketplace: [HTTP Forge](https://marketplace.visualstudio.com/items?itemName=henry-huang.http-forge)

## Who It Is For

- Developers who want to launch standalone HTTP Forge from terminal.
- Developers who want to run API collections from terminal.
- QA teams who need repeatable suite runs and JUnit reports.
- CI/CD pipelines that need API test gating without a GUI.
- Agent workflows that need MCP server lifecycle commands.

## Why HTTP Forge CLI

- Launch HTTP Forge in standalone UI mode with one command.
- Run API tests in CI/CD without a GUI.
- Use the same HTTP Forge workspace in editor and terminal.
- Generate JUnit, HTML, and AI-friendly Markdown run summaries for team visibility.
- Manage MCP server lifecycle for agent workflows.
- Work with OpenAPI, environments, and Postman-style scripts in one toolchain.

## Works With

- HTTP Forge workspaces and collections
- OpenAPI specs
- Postman imports
- GitHub Actions, Jenkins, GitLab CI, and other pipelines

## Postman Compatibility (Import + Run)

HTTP Forge CLI is designed for a full Postman-compatible flow in terminal:
- Import Postman collection exports.
- Import Postman environment exports.
- Run imported requests, folders, collections, and suites in CI/CD.
- Execute Postman-style scripts/assertions during runs.

```bash
# Import Postman collection
http-forge import collection --postman ./MyApi.postman_collection.json

# Import Postman environment
http-forge import env --postman ./MyEnv.postman_environment.json --env staging --overwrite

# Run imported collection using that environment
http-forge run collection "MyApi" --env staging --exit-code
```

## 1-Minute Quickstart

```bash
# 1) Install
npm install --global @http-forge/cli

# 2) Launch standalone HTTP Forge UI
http-forge launch

# 3) Import a Postman collection
http-forge import collection --postman ./MyApi.postman_collection.json

# 4) (Optional) Import a Postman environment
http-forge import env --postman ./MyEnv.postman_environment.json --env staging --overwrite

# 5) Run imported collection
http-forge run collection "MyApi" --env staging --exit-code

# 6) Run a suite with JUnit report for CI
http-forge run suite "smoke-tests" --env staging \
  --reporter junit:results/junit.xml --exit-code
```

## Install

```bash
npm install --global @http-forge/cli
```

From monorepo:

```bash
cd http-forge.cli
npm install
npm run build
```

## Core Commands

| Command | Purpose |
|---|---|
| `http-forge launch` | Launch standalone HTTP Forge UI (`--test`, `--dev`, `--both`) |
| `http-forge run ...` | Run a request, folder, collection, or suite |
| `http-forge mcp ...` | Start/stop/status for MCP server |
| `http-forge list ...` | List collections, suites, requests, folders, environments |
| `http-forge env ...` | Get/set/unset environment variables |
| `http-forge import ...` | Import collections and Postman environment files |
| `http-forge generate ...` | Generate typed TypeScript API clients from collections |
| `http-forge architect ...` | Design a complete REST API from a natural-language intent |
| `http-forge suggest-env ...` | Detect hardcoded values and suggest env vars |
| `http-forge refresh-agents-md` | Check `.http-forge/AGENTS.md` staleness (`--apply` refreshes with backup) |
| `http-forge schedule ...` | Generate scheduled CI workflow/cron config |
| `http-forge copy-as ...` | Export request as curl/fetch/python snippet |

## Design an API from a Natural-Language Intent

`http-forge architect` designs a complete REST API from a plain-English intent — endpoints, DTOs, and auth — then generates the full test suite, runnable flow, docs, and a round-trip OpenAPI export in one flow:

```bash
# Design an API (persists the collection; prints the reviewable package)
http-forge architect "I need a shopping cart"

# Approve: persist the suite and write the flow/docs/OpenAPI byproducts
http-forge architect "a todo list" --name "Todo API" \
  --base-url https://api.todo.dev --apply \
  --flow-out ./todo.flow.js --docs-out ./todo.md --openapi-out ./todo.openapi.json
```

Requires an AI provider (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`). All generated artifacts are tagged `ai_generated: true` so the Phase 2b drift machinery keeps them honest when your code changes.

## Generate Typed Clients

Use one consistent command for code generation in the HTTP Forge family:

```bash
# Generate all collections
http-forge generate --input ./collections --output ./api-clients

# Generate one collection
http-forge generate --input ./collections --output ./api-clients --collection forgerock-login

# Generate one request
http-forge generate --input ./collections --output ./api-clients --request forgerock-login/login-request
```

This command delegates to `@http-forge/codegen` under the hood.

Migration notes from `http-forge-codegen` are in [docs/cli-reference.md](docs/cli-reference.md#migration-from-http-forge-codegen).

## Launch Modes

```bash
# Default: standalone HTTP Forge profile
http-forge launch

# Use your normal VS Code profile
http-forge launch --dev

# Open both test and dev profiles
http-forge launch --both

# Open a workspace path
http-forge launch --dev /path/to/workspace
```

Use `http-forge launch` when you want the standalone HTTP Forge UI from terminal.

The launcher auto-detects OS/shell and picks the matching script:
- Linux/macOS: `scripts/http-forge.sh` via `/bin/bash`
- Windows Git Bash (MSYS/MinGW, `MSYSTEM`/`SHELL`/`BASH_VERSION`): `scripts/http-forge.sh` via `bash` (Windows path converted to `/c/...` for MSYS)
- Windows cmd / PowerShell: `scripts/http-forge.bat` via `cmd.exe /d /s /c call`

## Workspace Modes & Config

HTTP Forge CLI uses the same workspace discovery as `@http-forge/core`. Two Git layouts are supported with **any folder name** for standalone:

**Integrated** — `workspace/.http-forge/assets/{collections,environments,suites}` (default). Config priority: `workspace/http-forge.config.json` **before** `workspace/.http-forge/http-forge.config.json`. All `storage.*` / `history` / `results` / `scripts.modulePaths` / cert paths are resolved relative to the config file that defines them (old ` "./.http-forge/assets"` inside `.http-forge` is auto-stripped).

**Standalone (any name)** — clone the forge repo as `my-standalone`, `http-forge-assets`, `acme-tests` and open that folder. `assets/` at root or bare `collections/` at root are both recognized (structural check, not name). `my-standalone/assets` opened directly as workspace → normalized to `my-standalone`; `my-project/.http-forge/assets` → normalized to `my-project`.

**Lazy creation:** opening an empty folder does **not** create `.http-forge` on CLI startup. First `import`, `create`, or `run` that needs persistence creates `assets/collections` and `AGENTS.md` once.

**All commands accept `--workspace <path>`** (default `cwd` or `$HTTP_FORGE_WORKSPACE`). The same priority/relative rules apply regardless of which command you run.

## Common Run Patterns

```bash
# Collection
http-forge run collection "my-api" --env dev --include perRequest

# Suite
http-forge run suite "smoke-tests" --env staging --exit-code

# Request
http-forge run request "Get Users" --collection "my-api" --env dev

# Folder
http-forge run folder "Auth/Login" --collection "my-api" --env dev
```

If a folder name itself contains `/`, keep folder levels separated with ` / ` in the CLI input. Example: `http-forge run folder "agl-page-composition / TRAY/EPG / AVS5-5304 - TRAY/EPG" --collection "reg-agl-sq5"`.

## CI/CD Example

```bash
http-forge run suite "smoke-tests" \
  --env staging \
  --reporter junit:results/junit.xml \
  --exit-code
```

Use this in CI to fail the pipeline on assertion failures and publish JUnit artifacts.

## MCP Port Configuration

For `http-forge mcp start`, CLI uses `mcp.port` from `http-forge.config.json` by default (fallback `3100`).
Use `--port` to override for a single run.

```bash
# Uses mcp.port in http-forge.config.json (default 3100)
http-forge mcp start

# One-off override
http-forge mcp start --port 3201
```

## Detailed Docs

- Full CLI reference: `docs/cli-reference.md`
- CI guide: `docs/ci-guide.md`
- Example workflow: `docs/ci-example.yml`
- HTTP Forge docs: https://github.com/hsl1230/http-forge/tree/main/docs/user-guide

## License

MIT
