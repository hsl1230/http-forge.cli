/**
 * review command — Phase 3 review gate (Layer 7).
 *
 * Runs the deterministic review rules over a suite run's results and emits a
 * ReviewReport. CI-native: `--exit-code` fails the job when error-severity
 * findings are present (raise/lower the bar with `--severity`).
 *
 *   http-forge review --run-results results.json
 *   http-forge review --run-results results.json --suite <id> --output table
 *   http-forge review --run-results results.json --exit-code --severity error
 *
 * All review logic lives in @http-forge/core (review-engine).
 */

import {
  createNodeContainer,
  reviewSuiteRun,
  toReviewRequestResults,
} from '@http-forge/core';
import * as fs from 'fs';
import * as path from 'path';
import type { ReviewFinding, ReviewReport } from '@http-forge/core';

type SeverityBar = 'error' | 'warn' | 'info';

interface ReviewArgs {
  runResultsPath: string;
  suite?: string;
  outputFormat: 'json' | 'table' | 'markdown';
  severityBar: SeverityBar;
  exitCode: boolean;
  slowResponseMs: number;
}

export async function handleReview(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  const parsed = parseArgs(args);
  if (!parsed.runResultsPath) {
    console.error('Error: --run-results <file> is required');
    process.exit(2);
  }

  const runResultsPath = path.resolve(parsed.runResultsPath);
  if (!fs.existsSync(runResultsPath)) {
    console.error(`Error: run results file not found: ${runResultsPath}`);
    process.exit(2);
  }

  let runData: unknown;
  try {
    runData = JSON.parse(fs.readFileSync(runResultsPath, 'utf8'));
  } catch (e) {
    console.error(`Error: could not parse run results JSON: ${(e as Error).message}`);
    process.exit(2);
  }

  // Optional suite context — loaded from the workspace so the report carries
  // the suite id/name and coverage annotations for never-ran requests.
  let suite: Awaited<ReturnType<typeof loadSuite>> | undefined;
  if (parsed.suite) {
    const workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
    try {
      suite = await loadSuite(workspace, parsed.suite);
    } catch (e) {
      console.error(`Error: could not load suite "${parsed.suite}": ${(e as Error).message}`);
      process.exit(2);
    }
  }

  const results = toReviewRequestResults(runData);
  const report = reviewSuiteRun(suite, results, { slowResponseMs: parsed.slowResponseMs });

  if (parsed.outputFormat === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else if (parsed.outputFormat === 'markdown') {
    process.stdout.write(renderMarkdown(report) + '\n');
  } else {
    renderTable(report);
  }

  const blocking = countAtOrAbove(report.findings, parsed.severityBar);
  if (parsed.exitCode && blocking > 0) {
    console.error(
      `\nReview gate failed: ${blocking} finding(s) at severity "${parsed.severityBar}" or above.`
    );
    process.exit(1);
  }
}

async function loadSuite(workspace: string, label: string) {
  const container = createNodeContainer(workspace);
  const suites = await container.testSuite.getAllSuites();
  const q = label.toLowerCase();
  const suite =
    suites.find((s) => s.id === label || s.name === label) ??
    suites.find((s) => s.name.toLowerCase() === q);
  if (!suite) {
    throw new Error(`No suite matched "${label}" in workspace "${workspace}"`);
  }
  return suite;
}

function countAtOrAbove(findings: ReviewFinding[], bar: SeverityBar): number {
  // Higher = more severe. At-or-above "error" is only errors; at-or-above
  // "warn" is errors + warnings; at-or-above "info" is everything.
  const order: Record<SeverityBar, number> = { error: 3, warn: 2, info: 1 };
  const min = order[bar];
  return findings.filter((f) => order[f.severity] >= min).length;
}

function renderTable(report: ReviewReport): void {
  console.log(`Review: ${report.suiteName ?? '(no suite)'}${report.runId ? ` (${report.runId})` : ''}`);
  console.log(
    `  ${report.summary.errors} error(s) / ${report.summary.warnings} warning(s) / ${report.summary.infos} info — ${report.summary.pass ? 'PASS' : 'FAIL'}\n`
  );
  for (const f of report.findings) {
    const icon = f.severity === 'error' ? '✗' : f.severity === 'warn' ? '!' : 'i';
    const req = f.requestName ? ` [${f.requestName}]` : '';
    console.log(`  ${icon} [${f.severity}] ${f.rule}${req}`);
    console.log(`      ${f.title}`);
    if (f.suggestion) console.log(`      → ${f.suggestion}`);
  }
  if (report.findings.length === 0) console.log('  No findings — clean run.');
}

function renderMarkdown(report: ReviewReport): string {
  const icon = (s: string) => (s === 'error' ? '🔴' : s === 'warn' ? '🟡' : '🔵');
  const lines: string[] = [
    `## Review: ${report.suiteName ?? '(no suite)'}`,
    '',
    `**Result:** ${report.summary.errors} error(s) / ${report.summary.warnings} warning(s) / ` +
      `${report.summary.infos} info — **${report.summary.pass ? 'PASS' : 'FAIL'}**`,
    '',
  ];
  for (const f of report.findings) {
    lines.push(`- ${icon(f.severity)} **${f.rule}** — ${f.title}${f.requestName ? ` (\`${f.requestName}\`)` : ''}`);
    if (f.suggestion) lines.push(`  - ${f.suggestion}`);
  }
  if (report.findings.length === 0) lines.push('No findings — clean run.');
  return lines.join('\n');
}

function parseArgs(args: string[]): ReviewArgs {
  const parsed: ReviewArgs = {
    runResultsPath: '',
    outputFormat: 'json',
    severityBar: 'error',
    exitCode: false,
    slowResponseMs: 2000,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--run-results' || arg === '-r') && i + 1 < args.length) parsed.runResultsPath = args[++i];
    else if ((arg === '--suite' || arg === '-s') && i + 1 < args.length) parsed.suite = args[++i];
    else if (arg === '--exit-code') parsed.exitCode = true;
    else if (arg === '--severity' && i + 1 < args.length) {
      const v = args[++i];
      if (v === 'error' || v === 'warn' || v === 'info') parsed.severityBar = v;
    } else if (arg === '--slow-response-ms' && i + 1 < args.length) {
      parsed.slowResponseMs = Number(args[++i]) || 2000;
    } else if (arg === '--output' && i + 1 < args.length) {
      const v = args[++i];
      if (v === 'table' || v === 'markdown') parsed.outputFormat = v;
    } else if (arg === '--json') parsed.outputFormat = 'json';
  }
  return parsed;
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge review --run-results <file> [options]

Run the deterministic review rules over a suite run's results and emit a
ReviewReport (Phase 3 review gate). Fail-safe for CI with --exit-code.

Options:
  --run-results <file>     JSON file with run results (McpRunRecord { allResults }
                           or a bare array of request results)
  --suite <id|name>        Optional suite to carry suite context into the review
  --severity <level>       Gate bar for --exit-code: error | warn | info (default: error)
  --exit-code              Exit 1 when findings at/above --severity are present
  --slow-response-ms <n>   Slow-response threshold in ms (default: 2000)
  --output <fmt>           Output format: json | table | markdown (default: json)
  --json                   Short for --output json
  -h, --help               Show this help

Examples:
  http-forge review --run-results results.json --output table
  http-forge review --run-results results.json --suite smoke-tests --exit-code
  http-forge review --run-results results.json --severity warn --exit-code --output markdown
`);
}
