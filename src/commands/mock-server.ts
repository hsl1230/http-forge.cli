import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService, CollectionService } from '@http-forge/core';

export async function handleMockServer(args: string[]): Promise<void> {
  let workspace = process.cwd();
  let port = 3001;
  let collectionRef = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) workspace = args[++i];
    else if (args[i] === '--port' && i + 1 < args.length) port = parseInt(args[++i], 10);
    else if (args[i] === '--collection' && i + 1 < args.length) collectionRef = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: http-forge mock [options]

Start a local mock server from a collection.

Options:
  --collection <ref>   Collection name or ID (required)
  --port <number>      Port to listen on (default: 3001)
  --workspace <path>    Workspace folder (default: cwd)
  -h, --help           Show this help
`);
      return;
    }
  }

  if (!collectionRef) {
    console.error('Error: --collection <ref> is required');
    process.exit(2);
  }

  const configService = new ConfigService(workspace);
  const collectionService = new CollectionService(configService);
  const collection = collectionService.getCollectionByName(collectionRef) || collectionService.getCollection(collectionRef);

  if (!collection) {
    console.error(`Collection not found: ${collectionRef}`);
    process.exit(2);
  }

  // Build route map from collection requests
  const routes = new Map<string, { method: string; status: number; body: any }>();

  const walk = (items: any[], prefix: string = '') => {
    for (const item of items) {
      if (item.type === 'folder' && item.items) {
        walk(item.items, prefix);
      } else if (item.type === 'request' || item.method) {
        const url = new URL(item.url || '', 'http://localhost');
        const path = url.pathname;
        const method = (item.method || 'GET').toUpperCase();
        const key = `${method}:${path}`;
        routes.set(key, {
          method,
          status: 200,
          body: { message: 'Mock response', endpoint: path, method },
        });
      }
    }
  };
  walk(collection.items || []);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const key = `${req.method}:${url.pathname}`;
    const route = routes.get(key);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (route) {
      res.writeHead(route.status);
      res.end(JSON.stringify(route.body, null, 2));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found', path: url.pathname, method: req.method }));
    }
  });

  server.listen(port, () => {
    console.log(`Mock server running on http://localhost:${port}`);
    console.log(`Collection: ${collection.name} (${routes.size} routes)`);
    console.log('Press Ctrl+C to stop.');
  });

  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
}
