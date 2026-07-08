# Changelog

All notable changes to @http-forge/cli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.15 - 2026-07-08

### Added

- **`env import` command** — import Postman environment exports into HTTP Forge environments:
  - `http-forge env import --postman ./MyEnv.postman_environment.json`
  - Optional `--env <name>` to override target environment name
  - Optional `--overwrite` to replace variables in an existing environment
- **Top-level `import` aliases for consistency**:
  - `http-forge import collection ...` (alias of `generate-collection`)
  - `http-forge import env ...` (alias of `env import`)

### Changed

- **MCP port resolution is now config-first in CLI** — `http-forge mcp start` now defers to `mcp.port` in `http-forge.config.json` when `--port` is not provided (default remains `3100`).
- **MCP documentation alignment** — CLI README and reference docs now clarify config-first port behavior and one-off `--port` override semantics.
- **Import command surface is now canonical** — use `http-forge import collection ...` and `http-forge import env ...`; legacy top-level `generate-collection` and `env import` forms are no longer documented/supported.

## 0.2.12 - 2026-07-06

### Added

- **`generate` command** — `http-forge generate` now provides typed client generation directly from the main CLI command surface:
  - `--input/-i`, `--output/-o`
  - `--collection/-c`, `--request/-r`
  - `--overwrite`, `--types-only`, `--no-barrel`
- **Codegen integration via dependency** — CLI now delegates generation to `@http-forge/codegen`, enabling a single entry command for run + generate workflows.

### Changed

- **README/docs discoverability for generation** — CLI landing docs now include a dedicated `generate` section and link migration guidance to reference docs.
- **Keyword metadata alignment** — package keywords were synced with shared HTTP Forge family search terms while preserving CLI-specific discovery terms.

## 0.2.11 - 2026-07-05

### Added

- **`launch` command** — `http-forge launch` can now start HTTP Forge in UI mode directly from the terminal:
  - `--test` launches the isolated `HTTP Forge` profile
  - `--dev` launches the default VS Code profile with all installed extensions
  - `--both` launches both modes side by side
  - The command automatically selects the correct platform launcher script and forwards workspace arguments.

- **Cross-platform launcher scripts** — added `scripts/http-forge.sh` and `scripts/http-forge.bat` for Linux/macOS and Windows. The scripts can detect VS Code, install it if missing, ensure the extension is installed in the selected profile, and then launch HTTP Forge.

### Changed

- **README split into landing page + reference docs** — the main README is now a short discoverability-first landing page, while detailed command documentation is preserved in `docs/cli-reference.md`.
- **npm package metadata improved for discoverability** — description and keywords now better reflect standalone UI launching, Postman CLI alternative searches, API testing CLI usage, OpenAPI workflows, CI/CD, and MCP server automation.

## 0.2.5 - 2026-06-30

### Added

- **`generate-collection` command** — scaffold a new HTTP Forge collection from an existing source:
  - `--source curl` — parse a curl command string into a request and create a single-request collection
  - `--source postman` — import a Postman 2.x collection export file
  - `--source openapi` — scaffold all paths from an OpenAPI 3.0 JSON/YAML spec
  - `--ai` — use AI to enhance the imported requests with descriptions, assertions, and environment variable suggestions (requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
  - `--collection <name>` — name for the created collection (default: inferred from the file name or first request)
  - `--workspace <path>` — workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)

- **`suggest-env` command** — analyse a collection and suggest which hard-coded values should become environment variables:
  - Detects repeated literal values across URLs, headers, and bodies and proposes variable names
  - `--collection <ref>` (required) — collection name, slug, or id
  - `--ai` — use AI for detection instead of heuristic rules (requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`; ignores `--min-occurrences`)
  - `--min-occurrences <n>` — only suggest values appearing in ≥ N request locations (default: 1; heuristic mode only)
  - `--output json|table` — output format (default: `json`)
  - `--workspace <path>` — workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)

- **`schedule` command** — generate a CI schedule configuration for running a test suite automatically:
  - Outputs a **GitHub Actions workflow** file, a **cron entry**, or both — no daemon required
  - Generated workflow includes: Node 20 setup, `npm install -g @http-forge/cli`, suite run with configurable reporter, artifact upload (30-day retention), and an optional JUnit publish step
  - `--suite <name>` (required) — test suite name, slug, or id
  - `--env <name>` — environment to pass to the run
  - `--cron <expr>` — cron schedule expression (default: `"0 */6 * * *"` — every 6 hours)
  - `--output <path>` — output file path (default: `.github/workflows/http-forge-<suite>.yml`)
  - `--reporter <spec>` — reporter spec, e.g. `junit:results/junit.xml` (default: `junit`)
  - `--no-exit-code` — do not fail the CI job on assertion failures
  - `--format github-actions|cron|both` — what to generate (default: `github-actions`)
  - `--print-cron` — print a cron entry to stdout (alias for `--format cron`)
  - `--workspace <path>` — workspace folder (default: `$HTTP_FORGE_WORKSPACE` or cwd)

## 0.2.3 - 2026-06-28

### Added

- **`list` command** — list workspace resources without starting a run:
  - `http-forge list collections` — all collections (id, name, request count)
  - `http-forge list suites` — all test suites (id, name, request count, iterations)
  - `http-forge list environments` — all environments (name, active, variable count)
  - `http-forge list requests --collection <ref>` — all requests in a collection
    (id, name, method, URL, folder, description), with optional `--folder` filter
  - All subcommands support `--workspace` and `--output json|table`

- **`env` command** — read and write environment variables permanently:
  - `http-forge env list` — all environments (same as `list environments`)
  - `http-forge env get <name>` — show resolved variables for one environment; supports `--output table` and `--no-values`
  - `http-forge env set <env> <key> <value>` — write a variable to the env JSON file on disk (also accepts `key=value` syntax)
  - `http-forge env unset <env> <key>` — delete a variable from the env JSON file
  - `http-forge env select <name>` — change the active environment in config

- **`copy-as` command** — generate cURL, JavaScript `fetch`, or Python code snippets for any request in the workspace

- **`--concurrency <num>` flag** on `run-collection`, `run-folder`, and `run-suite` — parallel virtual users; each runs the full request sequence in order so inter-request dependencies are preserved (default: 1)

- **Symlinked to `@http-forge/core` latest** — `node_modules/@http-forge/core`
  now points to the local workspace source so all new MCP tools and APIs are
  immediately available without a publish cycle.

## 0.2.2 - 2026-06-26

### Added

- **`--reporter <spec>` flag** — generates reports in a single composable flag.
  Accepts `<name>` or `<name>:<path>` (inline path syntax, Playwright-style).
  The flag is repeatable; pass it multiple times to produce several formats in
  one run:
  ```
  --reporter junit:results/junit.xml
  --reporter html:reports/run.html
  --reporter html --reporter junit:results/junit.xml
  ```
  Supported names: `html` (HTML report), `junit` (JUnit XML).

- **`--exit-code` flag** — exits with code 1 when any assertion fails, enabling
  CI pipelines to gate on test results without inspecting JSON output.

- **`run-folder` gains `--no-recursive` support** in `--folder` / `recursive`
  handling; the composite GitHub Action forwards it via the `recursive` input.

- **GitHub Action `action.yml`** — composite action that installs Node, installs
  the CLI, and runs `http-forge run-suite` / `run-collection` / `run-folder`.
  Inputs: `suite`, `collection`, `folder`, `workspace`, `environment`,
  `iterations`, `stop_on_error`, `reporters`, `recursive`, `extra_args`,
  `node_version`, `cli_version`. Output: `all_passed`.

- **`Dockerfile`** — slim Alpine image (`node:20-alpine`) with the CLI
  preinstalled; mount workspace + results volumes for Docker-based CI.

- **CI guide** `docs/ci-guide.md` — comprehensive step-by-step guide covering
  GitHub Actions (composite action and npm install patterns), Docker, Jenkins /
  GitLab CI / CircleCI / Azure Pipelines, multi-environment matrix strategy, PR
  test-result annotations, and troubleshooting.

### Removed

- **`--out <path>` flag removed** — use `--reporter junit:<path>` instead.

### Changed

- **`ParsedArgs.reporters` type changed** from `string[]` to
  `Array<{ name: string; path?: string }>` — the colon-delimited path is parsed
  at the CLI boundary; only reporter names are passed through to
  `@http-forge/core`.

- **`finalizeCiReports`** rewritten to handle both `html` and `junit` reporters
  by name, copying each to its explicit path if provided.

- **README rewritten** with a table of contents, full flag reference for all
  four run commands, a Reporters section, and a CI/CD quick-start.

### Requires

- `@http-forge/core` ^0.7.0.

## 0.1.4 - 2026-06-22

### Changed

- **Unified addressing for `--collection`, `--request`, and `--folder`**: each
  value is now resolved by tier — id, then slug, then display name — stopping at
  the first match, so you can pass whichever is most convenient. `--folder`
  accepts a slash path whose segments are each resolved the same way.
  - `run-request` gained an optional `--folder` flag that scopes request
    resolution to that folder's subtree.
  - When a name matches multiple items, the command lists the candidates (id +
    path) and exits non-zero; pass the id or slug to disambiguate.
  - How each value resolved is printed to stderr, keeping stdout reserved for the
    JSON/table result.

### Fixed

- **Clean stdout for run commands**: the run commands now write only the
  JSON/table result to stdout and route all diagnostics (including core's
  `[ModuleLoader]` and other `console.log`/`console.info` output) to stderr, so
  piping/parsing stdout is reliable.

### Requires

- `@http-forge/core` ^0.4.3.
