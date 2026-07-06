# HTTP Forge CLI

[![npm version](https://img.shields.io/npm/v/%40http-forge%2Fcli)](https://www.npmjs.com/package/@http-forge/cli)
[![npm downloads](https://img.shields.io/npm/dm/%40http-forge%2Fcli)](https://www.npmjs.com/package/@http-forge/cli)
[![license](https://img.shields.io/npm/l/%40http-forge%2Fcli)](LICENSE)
[![node](https://img.shields.io/node/v/%40http-forge%2Fcli)](https://www.npmjs.com/package/@http-forge/cli)

The standalone launcher, terminal, and automation CLI for HTTP Forge.

Start HTTP Forge in UI mode from terminal, run API collections and suites in CI/CD, manage MCP server lifecycle, and generate JUnit/HTML reports for pipelines.

Postman alternative for local-first, Git-friendly API workflows in both UI and CLI modes.

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
- Generate JUnit and HTML reports for team visibility.
- Manage MCP server lifecycle for agent workflows.
- Work with OpenAPI, environments, and Postman-style scripts in one toolchain.

## Works With

- HTTP Forge workspaces and collections
- OpenAPI specs
- Postman imports
- GitHub Actions, Jenkins, GitLab CI, and other pipelines

## 1-Minute Quickstart

```bash
# 1) Install
npm install --global @http-forge/cli

# 2) Launch standalone HTTP Forge UI
http-forge launch

# 3) Run a collection
http-forge run collection "my-api" --env dev --exit-code

# 4) Run a suite with JUnit report for CI
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
| `http-forge generate ...` | Generate typed TypeScript API clients from collections |
| `http-forge generate-collection ...` | Create collection from curl, Postman, or OpenAPI |
| `http-forge suggest-env ...` | Detect hardcoded values and suggest env vars |
| `http-forge schedule ...` | Generate scheduled CI workflow/cron config |
| `http-forge copy-as ...` | Export request as curl/fetch/python snippet |

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

The launcher auto-detects OS/shell and uses the matching script:
- Linux/macOS: `scripts/http-forge.sh`
- Windows: `scripts/http-forge.bat`

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

## CI/CD Example

```bash
http-forge run suite "smoke-tests" \
  --env staging \
  --reporter junit:results/junit.xml \
  --exit-code
```

Use this in CI to fail the pipeline on assertion failures and publish JUnit artifacts.

## Detailed Docs

- Full CLI reference: `docs/cli-reference.md`
- CI guide: `docs/ci-guide.md`
- Example workflow: `docs/ci-example.yml`
- HTTP Forge docs: https://github.com/hsl1230/http-forge/tree/main/docs/user-guide

## License

MIT
