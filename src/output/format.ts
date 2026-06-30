/**
 * Output formatting and argument parsing utilities shared across all CLI commands.
 */

import type { ResolutionInfo } from '@http-forge/core';
import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────
// Argument Parsing
// ────────────────────────────────────────────────────────

export interface ParsedArgs {
  workspace: string;
  collection?: string;
  request?: string;
  suite?: string;
  folder?: string;
  recursive: boolean;
  environment?: string;
  variables: Record<string, unknown>;
  iterations?: number;
  concurrency?: number;
  stopOnError: boolean;
  delay?: number;
  requestFilter?: string[];
  include: string[];
  /** Parsed reporter entries: { name: 'junit'|'html', path?: string } */
  reporters: Array<{ name: string; path?: string }>;
  exitCode: boolean;
  output: 'json' | 'table';
}

export function parseArgs(args: string[]): ParsedArgs {
  const opts: ParsedArgs = {
    workspace: process.env.HTTP_FORGE_WORKSPACE ?? process.cwd(),
    recursive: true,
    variables: {},
    stopOnError: false,
    include: [],
    reporters: [],
    exitCode: false,
    output: 'json',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--workspace' && i + 1 < args.length) {
      opts.workspace = args[++i];
    } else if (arg === '--collection' && i + 1 < args.length) {
      opts.collection = args[++i];
    } else if (arg === '--request' && i + 1 < args.length) {
      opts.request = args[++i];
    } else if (arg === '--suite' && i + 1 < args.length) {
      opts.suite = args[++i];
    } else if (arg === '--folder' && i + 1 < args.length) {
      opts.folder = args[++i];
    } else if (arg === '--recursive' && i + 1 < args.length) {
      opts.recursive = args[++i] !== 'false';
    } else if (arg === '--no-recursive') {
      opts.recursive = false;
    } else if ((arg === '--environment' || arg === '--env') && i + 1 < args.length) {
      // --env is the short alias for --environment
      opts.environment = args[++i];
    } else if (arg === '--iterations' && i + 1 < args.length) {
      opts.iterations = parseInt(args[++i], 10);
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      opts.concurrency = parseInt(args[++i], 10);
    } else if (arg === '--stop-on-error') {
      opts.stopOnError = true;
    } else if (arg === '--delay' && i + 1 < args.length) {
      opts.delay = parseInt(args[++i], 10);
    } else if (arg === '--include' && i + 1 < args.length) {
      opts.include.push(args[++i]);
    } else if (arg === '--reporter' && i + 1 < args.length) {
      const raw = args[++i];
      const colonIdx = raw.indexOf(':');
      if (colonIdx > 0) {
        opts.reporters.push({ name: raw.slice(0, colonIdx), path: raw.slice(colonIdx + 1) });
      } else {
        opts.reporters.push({ name: raw });
      }
    } else if (arg === '--out' && i + 1 < args.length) {
      // --out <path> sets the output path for the last reporter, or defaults to junit
      const outPath = args[++i];
      if (opts.reporters.length > 0) {
        opts.reporters[opts.reporters.length - 1].path = outPath;
      } else {
        opts.reporters.push({ name: 'junit', path: outPath });
      }
    } else if (arg === '--exit-code') {
      opts.exitCode = true;
    } else if (arg === '--json') {
      // --json is a shorthand for --output json
      opts.output = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      const out = args[++i];
      if (out === 'json' || out === 'table') {
        opts.output = out;
      }
    } else if (arg === '--var' && i + 1 < args.length) {
      const pair = args[++i];
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        opts.variables[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
      }
    }
  }

  return opts;
}

/**
 * Merge process.env into variables at lowest priority.
 * Explicit --var flags (already in opts.variables) take precedence.
 */
export function mergeProcessEnv(opts: ParsedArgs): void {
  // HTTP_FORGE_ENV sets the default environment when --env is not provided
  if (!opts.environment && process.env.HTTP_FORGE_ENV) {
    opts.environment = process.env.HTTP_FORGE_ENV;
  }
  opts.variables = { ...process.env, ...opts.variables };
}

/**
 * Print how a reference (collection/folder/request) was resolved to stderr.
 * Goes to stderr to keep stdout reserved for the JSON/table result.
 */
export function logResolution(info: ResolutionInfo): void {
  if (info.kind === 'folder') {
    console.error(`Resolved --folder "${info.value}" -> ${info.id}`);
    return;
  }
  const loc = info.path ? ` (${info.path})` : '';
  console.error(`Resolved --${info.kind} "${info.value}" by ${info.tier} -> ${info.id}${loc}`);
}

/**
 * Guard stdout so it carries ONLY the machine-readable result.
 * Routes console.log/info to stderr while a run is in progress.
 * @returns a restore function that reinstates the original console methods.
 */
export function installStdoutGuard(): () => void {
  const originalLog = console.log;
  const originalInfo = console.info;
  console.log = (...args: unknown[]): void => console.error(...args);
  console.info = (...args: unknown[]): void => console.error(...args);
  return () => {
    console.log = originalLog;
    console.info = originalInfo;
  };
}

// ────────────────────────────────────────────────────────
// Result Output
// ────────────────────────────────────────────────────────

export function outputResult(result: unknown, format: 'json' | 'table'): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Result: ${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}\n`);
  }
}

/**
 * Tabular output for list commands.
 */
export function outputListResult(
  items: object[],
  format: 'json' | 'table',
  tableColumns: string[]
): void {
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
    return;
  }

  if (items.length === 0) {
    console.log('(no items)');
    return;
  }

  const rows = items as Record<string, unknown>[];
  const cols = tableColumns.filter((c) => rows.some((r) => r[c] !== undefined));
  const widths = cols.map((c) => {
    const maxVal = Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length));
    return Math.min(maxVal, 60);
  });

  const header = cols.map((c, i) => c.toUpperCase().padEnd(widths[i])).join('  ');
  const sep = cols.map((_, i) => '─'.repeat(widths[i])).join('  ');
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    const line = cols
      .map((c, i) => String(row[c] ?? '').substring(0, widths[i]).padEnd(widths[i]))
      .join('  ');
    console.log(line);
  }
  console.log(`\n${rows.length} item${rows.length !== 1 ? 's' : ''}`);
}

/**
 * Determine whether a run result represents an all-passing run.
 * Suite/collection/folder results expose `summary.allPassed`; a single request
 * result exposes `allPassed` directly. Defaults to true so we never fail a CI
 * build on an unrecognized response shape.
 */
export function runAllPassed(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const r = result as Record<string, unknown>;
  const summary = r.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary.allPassed === 'boolean') return summary.allPassed;
  if (typeof r.allPassed === 'boolean') return r.allPassed;
  return true;
}

/**
 * Post-run CI handling:
 * - Copy reporters to their explicit output paths.
 * - Exit 1 when --exit-code is set and any test failed.
 */
export function finalizeCiReports(result: unknown, opts: ParsedArgs): void {
  const r = result as Record<string, unknown> | undefined;

  for (const reporter of opts.reporters) {
    if (reporter.name === 'junit' && reporter.path) {
      const junit = r?.junitReport as { path?: string } | undefined;
      if (junit?.path && fs.existsSync(junit.path)) {
        fs.mkdirSync(path.dirname(path.resolve(reporter.path)), { recursive: true });
        fs.copyFileSync(junit.path, reporter.path);
        console.error(`Wrote JUnit report to ${reporter.path}`);
      } else {
        console.error('Warning: --reporter junit:<path> was set but no JUnit report was generated.');
      }
    }

    if (reporter.name === 'html' && reporter.path) {
      const report = r?.report as { uri?: string } | undefined;
      if (report?.uri) {
        const srcPath = report.uri.replace(/^file:\/\//, '');
        if (fs.existsSync(srcPath)) {
          fs.mkdirSync(path.dirname(path.resolve(reporter.path)), { recursive: true });
          fs.copyFileSync(srcPath, reporter.path);
          console.error(`Wrote HTML report to ${reporter.path}`);
        }
      } else {
        console.error(
          'Warning: --reporter html:<path> was set but no HTML report was generated ' +
          '(pass --include report or set HTTP_FORGE_GENERATE_REPORTS=true).'
        );
      }
    }
  }

  if (opts.exitCode && !runAllPassed(result)) {
    process.exit(1);
  }
}
