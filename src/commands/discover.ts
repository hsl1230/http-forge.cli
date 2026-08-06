/**
 * discover command — scan a backend project from source code and list the
 * endpoints found (methods / paths / params / bodies / auth) with provenance.
 *
 *   http-forge discover --path ./backend
 *   http-forge discover --path ./backend --framework spring
 *   http-forge discover --path ./backend --output table
 *
 * All discovery logic lives in @http-forge/core (infrastructure/api-discovery).
 * This file is a thin CLI adapter: arg parsing + output formatting only.
 */

import {
  ApiDiscoveryService,
  ExpressDiscoveryProvider,
  FastApiDiscoveryProvider,
  FastifyDiscoveryProvider,
  LambdaDiscoveryProvider,
  NestDiscoveryProvider,
  SpringDiscoveryProvider,
} from '@http-forge/core';
import { outputListResult } from '../output/format';

const ALL_PROVIDERS = [
  new ExpressDiscoveryProvider(),
  new NestDiscoveryProvider(),
  new FastifyDiscoveryProvider(),
  new LambdaDiscoveryProvider(),
  new SpringDiscoveryProvider(),
  new FastApiDiscoveryProvider(),
];

export async function handleDiscover(args: string[]): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    printUsage();
    return;
  }

  let projectPath: string | undefined;
  let frameworkFilter: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--path' || arg === '-p') && i + 1 < args.length) {
      projectPath = args[++i];
    } else if ((arg === '--framework' || arg === '-f') && i + 1 < args.length) {
      frameworkFilter = args[++i].toLowerCase();
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      outputFormat = args[++i] === 'table' ? 'table' : 'json';
    }
  }

  const projectRoot = projectPath ?? process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();

  const providers = frameworkFilter
    ? ALL_PROVIDERS.filter((p) => p.framework === frameworkFilter)
    : ALL_PROVIDERS;

  if (frameworkFilter && providers.length === 0) {
    console.error(`Error: unknown framework "${frameworkFilter}".`);
    printUsage();
    process.exit(2);
  }

  const service = new ApiDiscoveryService({ providers });

  let result;
  try {
    result = await service.discover({ workspaceFolder: projectRoot });
  } catch (error) {
    console.error(`Error: discovery failed for ${projectRoot}: ${(error as Error).message}`);
    process.exit(1);
  }

  if (outputFormat === 'json') {
    process.stdout.write(
      JSON.stringify(
        {
          projectRoot,
          frameworksDetected: result.stats.frameworksDetected,
          providersRun: result.stats.providersRun,
          endpointCount: result.stats.endpointCount,
          unresolvedEndpointCount: result.stats.unresolvedEndpointCount,
          scanDurationMs: result.stats.scanDurationMs,
          warnings: result.warnings,
          endpoints: result.endpoints,
        },
        null,
        2
      ) + '\n'
    );
    return;
  }

  if (result.endpoints.length === 0) {
    console.log(`No endpoints discovered in ${projectRoot}.`);
    console.log('  frameworks detected:', result.stats.frameworksDetected.join(', ') || '(none)');
    if (result.warnings.length > 0) {
      console.log('  warnings:');
      for (const w of result.warnings) {
        console.log(`    - ${w.code}: ${w.message}`);
      }
    }
    return;
  }

  console.log(`\nDiscovered ${result.endpoints.length} endpoint(s) in ${projectRoot}:`);
  console.log(`  frameworks: ${result.stats.frameworksDetected.join(', ')}`);
  if (result.warnings.length > 0) {
    console.log('  warnings:');
    for (const w of result.warnings) {
      console.log(`    - ${w.code}: ${w.message}`);
    }
  }
  console.log('');
  outputListResult(
    result.endpoints.map((ep) => ({
      method: ep.method,
      path: ep.pathExpression,
      confidence: ep.confidence,
      framework: ep.framework,
      source: ep.source.filePath
        ? `${ep.source.filePath}:${ep.source.line}`
        : '(unknown)',
    })),
    'table',
    ['method', 'path', 'confidence', 'framework', 'source']
  );
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge discover [options]

Scan a backend project from source code and list the endpoints it exposes
(methods / paths / params / bodies / auth) with file:line provenance.

Options:
  --path <path>           Project root to scan (default: \$HTTP_FORGE_WORKSPACE or cwd)
  --framework <name>      Restrict to one framework:
                          express, nestjs, fastify, lambda, spring, fastapi
                          (default: all)
  --output json|table     Output format (default: json)
  --json                  Short for --output json
  -h, --help              Show this help

Examples:
  http-forge discover
  http-forge discover --path ./backend
  http-forge discover --path ./backend --framework spring
  http-forge discover --path ./backend --output table

`);
}
