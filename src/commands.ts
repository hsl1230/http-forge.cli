/**
 * Barrel re-export — all CLI command handlers.
 *
 * Implementation files live in:
 *   src/commands/mcp.ts   — MCP server management
 *   src/commands/run.ts   — run-request, run-collection, run-folder, run-suite, copy-as, run group
 *   src/commands/list.ts  — list collections / suites / environments / requests
 *   src/commands/env.ts   — env list / get / set / unset / select
 *   src/output/format.ts  — ParsedArgs, parseArgs, outputResult, finalizeCiReports, ...
 */

export { handleEnv } from './commands/env';
export { handleGenerateCollection } from './commands/generate-collection';
export { handleList } from './commands/list';
export { handleMcpGroup, handleMcpServer } from './commands/mcp';
export {
    handleCopyAs,
    handleRunCollection,
    handleRunFolder,
    handleRunGroup,
    handleRunRequest,
    handleRunSuite
} from './commands/run';
export { handleSchedule } from './commands/schedule';
export { handleSuggestEnv } from './commands/suggest-env';

