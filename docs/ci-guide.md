
# HTTP Forge CLI — CI/CD Integration Guide

This guide explains how to run HTTP Forge API tests in continuous integration pipelines and publish the results so failures are visible on pull requests.

## Table of Contents

- [How it works](#how-it-works)
- [Reporters](#reporters)
- [Exit codes](#exit-codes)
- [Option A — GitHub Actions (composite action)](#option-a--github-actions-composite-action)
- [Option B — GitHub Actions (npm install)](#option-b--github-actions-npm-install)
- [Option C — Docker](#option-c--docker)
- [Option D — Jenkins / GitLab CI / other](#option-d--jenkins--gitlab-ci--other)
- [Option E — AI-driven analysis (MCP + Claude)](#option-e--ai-driven-analysis-mcp--claude)
- [Publishing results on pull requests](#publishing-results-on-pull-requests)
- [Environment variables and secrets](#environment-variables-and-secrets)
- [Running a folder instead of a full suite](#running-a-folder-instead-of-a-full-suite)
- [Multi-environment matrix](#multi-environment-matrix)
- [Troubleshooting](#troubleshooting)

---

## How it works

HTTP Forge stores collections, suites, and environments as plain JSON files in your Git repository (under `collections/`, `suites/`, `environments/`). The CLI reads those files directly — no server, no daemon, no database.

In CI you:
1. Check out the repository (which includes your test definitions).
2. Install and run `http-forge run suite` (or `run collection` / `run folder`).
3. Publish the generated JUnit XML as a test report artifact.
4. Optionally gate the build with `--exit-code` so failures block the PR.

```
GitHub Actions
  └── actions/checkout@v4           ← gets your request definitions
  └── http-forge run suite          ← executes them against staging
        --reporter junit:results/   ← writes junit.xml
        --exit-code                 ← exits 1 if any assertion fails
  └── actions/upload-artifact@v4   ← publishes junit.xml for PR annotation
```

---

## Reporters

Use `--reporter <name>` or `--reporter <name>:<path>` to produce reports. The flag is **repeatable** — pass it multiple times to generate several formats in one run.

```bash
# JUnit XML only (CI-friendly)
--reporter junit:results/junit.xml

# HTML report only (human-friendly)
--reporter html:reports/run.html

# Both at the same time
--reporter junit:results/junit.xml --reporter html:reports/run.html
```

| Name | Output | Best for |
|---|---|---|
| `junit` | XML (JUnit 5 format) | CI systems, PR annotations, Allure |
| `html` | Self-contained HTML | Local review, email, Confluence |

When no `:<path>` is given, the file is written to the HTTP Forge cache (`.http-forge-cache/results/<suite>/<run>/`) and the path is included in the JSON result under `junitReport.path` / `report.uri`.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All assertions passed (or `--exit-code` not set) |
| `1` | One or more assertions failed (only when `--exit-code` is set) |
| `2` | Argument error or runtime error |

Always use `--exit-code` in CI so a failed API test actually fails the build.

---

## Option A — GitHub Actions (composite action)

The simplest approach. The action handles Node setup and CLI install for you.

```yaml
# .github/workflows/api-tests.yml
name: API Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  api-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run HTTP Forge API tests
        uses: http-forge/http-forge.cli@main    # pin a release tag in production
        with:
          suite: smoke-tests
          workspace: ./http-forge-assets        # path to your workspace
          environment: staging
          reporters: 'junit:test-results/junit.xml'
          extra_args: '--var BASE_URL=${{ vars.STAGING_URL }} --var API_KEY=${{ secrets.API_KEY }}'

      # Always upload even when the step above fails (--exit-code exits 1)
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-results
          path: test-results/junit.xml
          retention-days: 30
```

### Action inputs

| Input | Description | Default |
|---|---|---|
| `suite` | Suite ID to run | — |
| `collection` | Collection to run (alternative to `suite`) | — |
| `folder` | Folder path within a collection | — |
| `workspace` | Path to the HTTP Forge workspace | `.` |
| `environment` | Environment name | — |
| `iterations` | Number of iterations | `1` |
| `stop_on_error` | Stop on first failure | `false` |
| `reporters` | Comma-separated reporter specs | `junit:test-results/junit.xml` |
| `recursive` | Include sub-folders (for `folder` runs) | `true` |
| `extra_args` | Raw extra CLI flags | — |
| `node_version` | Node.js version (≥ 20) | `20` |
| `cli_version` | `@http-forge/cli` npm version | `latest` |

### Action outputs

| Output | Description |
|---|---|
| `all_passed` | `"true"` when every assertion passed |

---

## Option B — GitHub Actions (npm install)

Use this when you need more control over the Node setup or want to cache the CLI install.

```yaml
name: API Tests

on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install HTTP Forge CLI
        run: npm install --global @http-forge/cli@latest

      - name: Run suite
        run: |
          mkdir -p test-results
          http-forge run suite \
            --workspace ./http-forge-assets \
            --suite smoke-tests \
            --environment staging \
            --reporter junit:test-results/junit.xml \
            --exit-code \
            --var API_KEY=${{ secrets.API_KEY }}

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-results
          path: test-results/junit.xml
```

#### Both HTML and JUnit

```yaml
      - name: Run suite (HTML + JUnit)
        run: |
          http-forge run suite \
            --workspace ./http-forge-assets \
            --suite smoke-tests \
            --reporter html:reports/run.html \
            --reporter junit:test-results/junit.xml \
            --exit-code

      - name: Upload HTML report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: html-report
          path: reports/run.html

      - name: Upload JUnit XML
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: junit-results
          path: test-results/junit.xml
```

---

## Option C — Docker

Use the Docker image for a fully self-contained, reproducible environment.

```yaml
      - name: Run HTTP Forge via Docker
        run: |
          mkdir -p test-results
          docker run --rm \
            -v "${{ github.workspace }}/http-forge-assets:/workspace" \
            -v "${{ github.workspace }}/test-results:/results" \
            ghcr.io/http-forge/cli:latest \
            run suite smoke-tests \
              --environment staging \
              --reporter junit:/results/junit.xml \
              --exit-code \
              --var API_KEY=${{ secrets.API_KEY }}
```

Mount your workspace into `/workspace` (the container's working directory) and mount a local directory into `/results` to get the JUnit file back out.

### Build the Docker image locally

```bash
cd http-forge.cli
docker build -t http-forge-cli .

docker run --rm \
  -v "$PWD/../http-forge-assets:/workspace" \
  http-forge-cli \
  run suite smoke-tests --reporter junit:results/junit.xml --exit-code
```

---

## Option D — Jenkins / GitLab CI / other

Any CI system that can run shell commands works the same way:

```bash
# Install (once, or via a base image)
npm install --global @http-forge/cli@latest

# Run
http-forge run suite \
  --workspace ./http-forge-assets \
  --suite regression \
  --environment staging \
  --reporter junit:test-results/junit.xml \
  --exit-code
```

Then publish `test-results/junit.xml` with your platform's JUnit reporter plugin:
- **Jenkins**: `junit 'test-results/junit.xml'` in a `post` block
- **GitLab CI**: `artifacts: reports: junit: test-results/junit.xml`
- **CircleCI**: `store_test_results: path: test-results`
- **Azure Pipelines**: `PublishTestResults` task, format `JUnit`

---

## Publishing results on pull requests

GitHub does not natively annotate PRs from JUnit files. Use a community action:

```yaml
      - name: Publish Test Report on PR
        uses: mikepenz/action-junit-report@v4
        if: always()
        with:
          report_paths: test-results/junit.xml
          check_name: 'API Test Results'
          fail_on_failure: true
```

This adds a check on the PR that shows which requests failed and includes the failure message inline.

---

## Environment variables and secrets

All shell environment variables are automatically forwarded as template variables inside requests. You do not need `--var` for every CI secret — just set them in the `env:` block.

Two special variables control CLI defaults:

| Variable | Purpose |
|---|---|
| `HTTP_FORGE_WORKSPACE` | Default workspace folder (used by all commands when `--workspace` is omitted) |
| `HTTP_FORGE_ENV` | Default environment name for all `run` commands (used when `--env` / `--environment` is omitted) |

Set them in your shell profile or CI pipeline so you can run commands without flags:

```bash
export HTTP_FORGE_WORKSPACE=/path/to/http-forge-assets
export HTTP_FORGE_ENV=staging

http-forge run suite "Smoke Tests" --exit-code  # no --workspace or --env needed
```

```yaml
      - name: Run suite
        run: |
          http-forge run suite \
            --suite smoke-tests \
            --environment staging \
            --exit-code \
            --reporter junit:results/junit.xml
        env:
          API_KEY: ${{ secrets.API_KEY }}         # available as {{API_KEY}}
          BASE_URL: ${{ vars.STAGING_BASE_URL }}   # available as {{BASE_URL}}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}  # available as {{DB_PASSWORD}}
```

Use `--var KEY=VALUE` to override a variable that is also defined in the environment file:

```bash
http-forge run suite smoke --var BASE_URL=https://override.example.com
```

**Priority (highest → lowest):**
1. `--var KEY=VALUE` CLI flags
2. Shell environment variables (`process.env`)
3. `<env>.local.json` (gitignored credential overrides)
4. `<env>.json` environment file
5. `_global.json` / `_global.local.json` global variables

---

## Running a folder instead of a full suite

Run only the requests under a specific folder to keep CI fast:

```bash
# Run just the "Auth" folder
http-forge run folder \
  --collection my-api \
  --folder Auth \
  --environment staging \
  --reporter junit:results/junit.xml \
  --exit-code

# Run only the direct children of "Checkout" (skip sub-folders)
http-forge run folder \
  --collection my-api \
  --folder Checkout \
  --no-recursive \
  --reporter junit:results/junit.xml \
  --exit-code
```

Using the composite action:

```yaml
      - uses: http-forge/http-forge.cli@main
        with:
          collection: my-api
          folder: Auth/Login        # run only this sub-folder
          environment: staging
          reporters: 'junit:test-results/junit.xml'
```

---

## Multi-environment matrix

Test against multiple environments in parallel using a matrix strategy:

```yaml
jobs:
  api-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [staging, uat, production]
      fail-fast: false   # run all environments even if one fails

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install --global @http-forge/cli@latest

      - name: Run suite (${{ matrix.environment }})
        run: |
          http-forge run suite \
            --workspace ./http-forge-assets \
            --suite smoke-tests \
            --environment ${{ matrix.environment }} \
            --reporter junit:results/${{ matrix.environment }}-junit.xml \
            --exit-code
        env:
          API_KEY: ${{ secrets[format('{0}_API_KEY', matrix.environment)] }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: results-${{ matrix.environment }}
          path: results/${{ matrix.environment }}-junit.xml
```

---

## Option E — AI-driven analysis (MCP + Claude)

This option adds a second CI job that runs **only when tests fail**. It connects to the HTTP Forge MCP server, invokes the `analyze-test-failure` prompt, and sends the structured failure data to Claude. The resulting diagnosis is written to a Markdown artifact and posted as a PR comment.

**Requirements:**
- `ANTHROPIC_API_KEY` GitHub secret (or equivalent from another provider)
- Node.js ≥ 20 in CI

**What the AI reports per failed request:**
- Root cause (assertion mismatch, HTTP error, script exception, etc.)
- Specific fix recommendations (corrected URL, missing header, wrong body field, etc.)
- Updated `pm.test()` assertions when the existing ones are wrong

### Ready-to-use workflow

A complete workflow is provided at [`.github/workflows/api-tests.yml`](../../.github/workflows/api-tests.yml) in this repository. It includes:

- `api-tests` job — runs on every push and PR, plus daily at 16:00 (UTC+8) via cron
- `ai-analysis` job — triggered automatically when `api-tests` fails and `ANTHROPIC_API_KEY` is set

The AI analysis script is at [`.github/scripts/ai-analyze-failures.js`](../../.github/scripts/ai-analyze-failures.js).

### How it works

```
api-tests job (fails)
    │
    └── ai-analysis job
            │
            ├── http-forge mcp start
            │
            ├── node ai-analyze-failures.js
            │       │
            │       ├── mcp.callTool('run_collection', ...)   ← re-runs to get fresh runId
            │       ├── mcp.callTool('get_run_summary', ...)  ← failedRequests are inline
            │       ├── mcp.getPrompt('analyze-test-failure') ← structured messages
            │       └── anthropic.messages.create(...)        ← Claude diagnosis
            │
            ├── Upload ai-analysis.md as artifact
            └── Post diagnosis as PR comment
```

### Key response fields

When `get_run_summary` returns failures, the response includes two AI-guidance fields:

| Field | Description |
|---|---|
| `failedRequests` | Full details for each failed request: `method`, `url`, `requestBody`, `requestHeaders` (redacted), `status`, `responseBody`, `failedTests` |
| `_nextStep` | Imperative instruction for the AI agent describing what to do with `failedRequests` |
| `_suggestions` | Present when requests have no `pm.test()` assertions — points AI to `suggest-assertions` or `review-collection` prompt |

### Minimal inline example

If you already have a workflow and only want to add AI analysis on failure:

```yaml
  ai-analysis:
    needs: api-tests
    if: failure() && needs.api-tests.result == 'failure'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: |
          npm install -g @http-forge/cli
          npm install @anthropic-ai/sdk @modelcontextprotocol/sdk
      - run: |
          # Uses mcp.port from http-forge.config.json (default 3100)
          http-forge mcp start --workspace "$GITHUB_WORKSPACE" &
          sleep 3
          node .github/scripts/ai-analyze-failures.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          HTTP_FORGE_VAR_API_KEY: ${{ secrets.API_KEY }}
      - run: http-forge mcp stop
        if: always()
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: ai-analysis, path: results/ai-analysis.md }
```

---

## Troubleshooting

### `Test suite "..." not found`

The `--suite` value can be a suite **name** or **id** (case-insensitive name matching is supported). If the suite is still not found, check that the `--workspace` path points to a directory that contains a `suites/` folder. Check that the workspace is set to the root of your HTTP Forge assets (e.g. `./http-forge-assets`), not the repository root.

### All requests fail with `Invalid URL`

Your environment file has unresolved variables for the base URL. Check that:
- The correct `--environment` is set.
- `BASE_URL` (or whatever your collection uses) is defined in `<env>.json` or passed via `--var`.

### `--exit-code` exits 0 even with failures

Check that `--exit-code` is present in the command. Without it, the CLI always exits 0 after a successful run (even if assertions failed) so it can be used in scripting without disrupting a pipeline.

### JUnit file is empty / `<testsuites tests="0">`

The suite ran but no requests produced results. This usually means:
- The suite has no enabled requests.
- The `--workspace` path is correct but the suite references requests from a collection that does not exist there.
- All requests were skipped due to `--stop-on-error` triggering on the first request before any results were recorded.

### `--reporter html` produces no file

HTML report generation requires at least one completed request with a recorded response. If all requests fail immediately (e.g. network unreachable), the HTML generator produces nothing. Use `--reporter junit` which always outputs XML regardless of request outcome.
