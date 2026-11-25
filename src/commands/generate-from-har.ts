import * as fs from 'fs';
import * as path from 'path';
import { CollectionService, ConfigService } from '@http-forge/core';

export async function handleGenerateFromHar(args: string[]): Promise<void> {
  let workspace = process.cwd();
  let harPath = '';
  let collectionName = 'Generated from HAR';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) workspace = args[++i];
    else if (args[i] === '--har' && i + 1 < args.length) harPath = args[++i];
    else if (args[i] === '--collection' && i + 1 < args.length) collectionName = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: http-forge generate-from-har [options]

Generate a collection from a HAR (HTTP Archive) file.

Options:
  --har <path>           Path to the HAR file (required)
  --collection <name>    Collection name (default: "Generated from HAR")
  --workspace <path>     Workspace folder (default: cwd)
  -h, --help             Show this help
`);
      return;
    }
  }

  if (!harPath) {
    console.error('Error: --har <path> is required');
    process.exit(2);
  }

  const harContent = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
  const entries = harContent?.log?.entries || [];

  const requests = entries
    .filter((e: any) => e.request && e.response)
    .map((e: any, idx: number) => {
      const req = e.request;
      const url = new URL(req.url);
      return {
        name: `${req.method} ${url.pathname}`,
        method: req.method,
        url: req.url,
        headers: (req.headers || []).map((h: any) => ({ key: h.name, value: h.value, enabled: true })),
        body: req.postData ? { type: 'raw', content: req.postData.text } : undefined,
      };
    });

  // Deduplicate by method + URL
  const seen = new Set<string>();
  const unique = requests.filter((r: any) => {
    const key = `${r.method}:${r.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Found ${entries.length} entries, ${unique.length} unique requests.`);

  const configService = new ConfigService(workspace);
  const collectionService = new CollectionService(configService);

  const collection = await collectionService.createCollection(collectionName);
  for (const req of unique) {
    await collectionService.createRequest({ collectionId: collection.id,
      name: req.name,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    });
  }

  console.log(`Created collection "${collectionName}" with ${unique.length} requests.`);
  console.log(`Collection ID: ${collection.id}`);
}
