/**
 * List command — inspect workspace resources without starting a run.
 *
 *   http-forge list collections
 *   http-forge list suites [--output table]
 *   http-forge list environments
 *   http-forge list requests --collection <ref> [--folder <path>]
 *
 * All subcommands support --workspace, --output json|table, and --json.
 */

import { createNodeContainer, flattenRequests, resolveCollectionRef } from '@http-forge/core';
import { outputListResult } from '../output/format';

function countSuiteRequestNodes(suite: any): number {
  const walk = (nodes: any[] | undefined): number => {
    if (!Array.isArray(nodes)) return 0;

    let total = 0;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (node.type === 'request') total += 1;

      total += walk((node as any).nodes);
      total += walk((node as any).then);
      total += walk((node as any).else);
      total += walk((node as any).default);

      const elseifBranches = (node as any).elseif;
      if (Array.isArray(elseifBranches)) {
        for (const branch of elseifBranches) {
          total += walk((branch as any)?.nodes);
          total += walk((branch as any)?.then);
        }
      }

      const branches = (node as any).branches;
      if (Array.isArray(branches)) {
        for (const branch of branches) {
          total += walk((branch as any)?.nodes);
        }
      }
    }

    return total;
  };

  const fromNodes = walk((suite as any)?.nodes);
  if (fromNodes > 0) return fromNodes;

  const legacyRequests = (suite as any)?.requests;
  return Array.isArray(legacyRequests) ? legacyRequests.length : 0;
}

export async function handleList(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    console.log(`
Usage: http-forge list <subcommand> [options]

Subcommands:
  collections       List all collections (id, name, description, request count)
  suites            List all test suites (id, name, request count, iterations)
  environments      List all environments (name, active, variable count)
  requests          List requests in a collection (requires --collection)
  folders           List folders in a collection (requires --collection)

Options:
  --workspace <path>    Workspace folder (default: $HTTP_FORGE_WORKSPACE or cwd)
  --collection <ref>    Collection name, slug, or id (required for 'requests'/'folders')
  --folder <path>       Filter to this folder path (for 'requests' and 'folders')
  --output json|table   Output format (default: json)
  --json                Short for --output json
`);
    return;
  }

  let workspace = process.env.HTTP_FORGE_WORKSPACE ?? process.cwd();
  let collectionRef: string | undefined;
  let folderFilter: string | undefined;
  let outputFormat: 'json' | 'table' = 'json';

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--workspace' && i + 1 < args.length) {
      workspace = args[++i];
    } else if (arg === '--collection' && i + 1 < args.length) {
      collectionRef = args[++i];
    } else if (arg === '--folder' && i + 1 < args.length) {
      folderFilter = args[++i];
    } else if (arg === '--json') {
      outputFormat = 'json';
    } else if (arg === '--output' && i + 1 < args.length) {
      const fmt = args[++i];
      outputFormat = fmt === 'table' ? 'table' : 'json';
    }
  }

  const container = createNodeContainer(workspace);

  try {
    if (subcommand === 'collections') {
      const collections = container.collection.getAllCollections();
      const result = collections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? '',
        requestCount: flattenRequests(c).length,
      }));
      outputListResult(result, outputFormat, ['id', 'name', 'requestCount', 'description']);

    } else if (subcommand === 'suites') {
      const suites = await container.testSuite.getAllSuites();
      const result = suites.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? '',
        requestCount: countSuiteRequestNodes(s),
        iterations: s.config?.iterations ?? 1,
      }));
      outputListResult(result, outputFormat, ['id', 'name', 'requestCount', 'iterations', 'description']);

    } else if (subcommand === 'environments') {
      const envs = container.environmentConfig.getAllEnvironments();
      const result = envs.map((e) => ({
        name: e.name,
        active: e.active,
        variableCount: Object.keys(e.variables ?? {}).length,
      }));
      outputListResult(result, outputFormat, ['name', 'active', 'variableCount']);

    } else if (subcommand === 'requests') {
      if (!collectionRef) {
        console.error('Error: --collection <ref> is required for "list requests"');
        process.exit(2);
      }
      const collections = container.collection.getAllCollections();
      let col;
      try {
        ({ collection: col } = resolveCollectionRef(collections, collectionRef));
      } catch {
        const names = collections.map((c) => `"${c.name}"`).join(', ');
        console.error(
          `Error: collection "${collectionRef}" not found. Available: ${names || '(none)'}`
        );
        process.exit(1);
      }
      let flat = flattenRequests(col);
      if (folderFilter) {
        const fq = folderFilter.toLowerCase();
        flat = flat.filter(
          (r) =>
            r.folderPath.toLowerCase().startsWith(fq) ||
            r.folderPath.toLowerCase().includes(fq)
        );
      }
      const result = flat.map((r) => ({
        id: r.request.id,
        name: r.request.name,
        method: r.request.method,
        url: r.request.url ?? '',
        folder: r.folderPath || '(root)',
        description: r.request.description ?? '',
      }));
      outputListResult(result, outputFormat, ['method', 'name', 'folder', 'url']);

    } else if (subcommand === 'folders') {
      if (!collectionRef) {
        console.error('Error: --collection <ref> is required for "list folders"');
        process.exit(2);
      }
      const collections = container.collection.getAllCollections();
      let col;
      try {
        ({ collection: col } = resolveCollectionRef(collections, collectionRef));
      } catch {
        const names = collections.map((c) => `"${c.name}"`).join(', ');
        console.error(
          `Error: collection "${collectionRef}" not found. Available: ${names || '(none)'}`
        );
        process.exit(1);
      }
      const flat = flattenRequests(col);
      const seen = new Set<string>();
      const result: { path: string; requestCount: number }[] = [];
      for (const { folderPath } of flat) {
        if (folderPath && !seen.has(folderPath)) {
          if (folderFilter) {
            const fq = folderFilter.toLowerCase();
            if (!folderPath.toLowerCase().startsWith(fq) && !folderPath.toLowerCase().includes(fq)) continue;
          }
          seen.add(folderPath);
          result.push({
            path: folderPath,
            requestCount: flat.filter((r) => r.folderPath === folderPath).length,
          });
        }
      }
      outputListResult(result, outputFormat, ['path', 'requestCount']);

    } else {
      console.error(
        `Unknown list subcommand: "${subcommand}". Valid: collections, suites, environments, requests, folders`
      );
      process.exit(2);
    }
  } finally {
    try { (container as any).dispose?.(); } catch { /* best-effort */ }
  }
}
