/**
 * Generate command — generate typed TypeScript API clients from HTTP Forge collections.
 *
 * Delegates to @http-forge/codegen so users need only install @http-forge/cli globally.
 *
 *   http-forge generate --input ./collections --output ./api-clients
 *   http-forge generate --input ./collections --output ./api-clients --collection forgerock-login
 *   http-forge generate --input ./collections --output ./api-clients --request forgerock-login/login-request
 *   http-forge generate --input ./collections --output ./api-clients --overwrite
 *   http-forge generate --input ./collections --output ./api-clients --types-only
 *   http-forge generate --input ./collections --output ./api-clients --no-barrel
 */

export async function handleGenerate(args: string[]): Promise<void> {
    // Parse arguments manually to avoid adding commander as a top-level CLI dep
    let input: string | undefined;
    let output: string | undefined;
    let collection: string | undefined;
    let request: string | undefined;
    let overwrite = false;
    let typesOnly = false;
    let updateBarrel = true;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '-i':
            case '--input':
                input = args[++i];
                break;
            case '-o':
            case '--output':
                output = args[++i];
                break;
            case '-c':
            case '--collection':
                collection = args[++i];
                break;
            case '-r':
            case '--request':
                request = args[++i];
                break;
            case '--overwrite':
                overwrite = true;
                break;
            case '--types-only':
                typesOnly = true;
                break;
            case '--no-barrel':
                updateBarrel = false;
                break;
            case '-h':
            case '--help':
                printGenerateUsage();
                return;
            default:
                console.error(`Unknown option: ${arg}`);
                printGenerateUsage();
                process.exit(2);
        }
    }

    if (!input || !output) {
        console.error('Error: --input and --output are required');
        printGenerateUsage();
        process.exit(2);
    }

    // Dynamically require @http-forge/codegen so missing install gives a clear error
    let codegen: typeof import('@http-forge/codegen');
    try {
        codegen = await import('@http-forge/codegen');
    } catch {
        console.error(
            'Error: @http-forge/codegen is not installed.\n' +
            'Run: npm install --global @http-forge/codegen'
        );
        process.exit(1);
    }

    if (request) {
        await codegen.generateSingleRequest({ input, output, request, overwrite, updateBarrel });
        console.log(`Generated: ${request}`);
    } else if (collection) {
        await codegen.generateCollection({ input, output, collection, overwrite, updateBarrel });
        console.log(`Generated collection: ${collection}`);
    } else {
        await codegen.generateClients({ input, output, overwrite, typesOnly });
        console.log(`Generated all collections → ${output}`);
    }
}

function printGenerateUsage(): void {
    console.log(`
USAGE:
  http-forge generate --input <path> --output <path> [options]

OPTIONS:
  -i, --input <path>       HTTP Forge collections folder (required)
  -o, --output <path>      Output folder for generated clients (required)
  -c, --collection <name>  Generate a single collection only
  -r, --request <path>     Generate a single request (e.g. my-api/get-user)
      --overwrite           Overwrite existing generated files
      --types-only          Emit only TypeScript type definitions, no runtime functions
      --no-barrel           Skip index.ts barrel file generation
  -h, --help               Show this help

EXAMPLES:
  http-forge generate -i ./collections -o ./api-clients
  http-forge generate -i ./collections -o ./api-clients -c forgerock-login
  http-forge generate -i ./collections -o ./api-clients -r forgerock-login/login-request
  http-forge generate -i ./collections -o ./api-clients --overwrite --types-only
`);
}
