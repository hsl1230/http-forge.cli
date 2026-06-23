# Changelog

All notable changes to @http-forge/cli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
