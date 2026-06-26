# Changelog

All notable changes to @http-forge/cli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
