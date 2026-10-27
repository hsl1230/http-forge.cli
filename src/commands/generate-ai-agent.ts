/**
 * generate-ai-agent command — alias for `refresh-agents-md`.
 *
 *   http-forge generate-ai-agent [--workspace <root>]   (dry-run status)
 *   http-forge generate-ai-agent --apply               (backup + rewrite)
 *   http-forge generate-ai-agent --refresh             (alias for --apply)
 *
 * Creates `.http-forge/AGENTS.md` if missing, or refreshes it when stale.
 * All guide logic lives in `@http-forge/core` (agents-md).
 */

import { handleRefreshAgentsMd } from './refresh-agents-md';

export async function handleGenerateAiAgent(args: string[]): Promise<void> {
  const mapped = args.map((arg) => (arg === '--refresh' ? '--apply' : arg));
  await handleRefreshAgentsMd(mapped);
}

function printUsage(): void {
  process.stdout.write(`
Usage: http-forge generate-ai-agent [--workspace <root>] [--apply] [--refresh] [--output json|table]

Alias for refresh-agents-md. Check whether .http-forge/AGENTS.md is stale,
or generate/refresh it with --apply (or --refresh).

Options:
  --workspace, -w <path>  Workspace root (default: $HTTP_FORGE_WORKSPACE or cwd)
  --apply                 Back up and rewrite the guide (default: status only)
  --refresh               Alias for --apply
  --output, --json        Output format: json (default) or table

Examples:
  http-forge generate-ai-agent --workspace ./my-project
  http-forge generate-ai-agent --apply
  http-forge generate-ai-agent --refresh
`);
}
