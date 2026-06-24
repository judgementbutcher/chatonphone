import { createServer as createHttpServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function isApiPath(pathname) {
  return pathname.startsWith('/auth/') || pathname.startsWith('/sync/settings/') || pathname === '/v1/chat/completions' || pathname === '/v1/models';
}

function nodeHeadersToFetch(headers) {
  const fetchHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      fetchHeaders.set(key, value.join(', '));
    } else if (typeof value === 'string') {
      fetchHeaders.set(key, value);
    }
  }

  return fetchHeaders;
}

function requestUrl(request) {
  const host = request.headers.host ?? '127.0.0.1';
  const proto = request.headers['x-forwarded-proto'] ?? 'http';

  return new URL(request.url ?? '/', `${proto}://${host}`).toString();
}

function nodeRequestToFetch(request) {
  const init = {
    method: request.method,
    headers: nodeHeadersToFetch(request.headers)
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request;
    init.duplex = 'half';
  }

  return new Request(requestUrl(request), init);
}

async function writeFetchResponse(nodeResponse, fetchResponse, isHead = false) {
  nodeResponse.statusCode = fetchResponse.status;
  nodeResponse.statusMessage = fetchResponse.statusText;
  fetchResponse.headers.forEach((value, key) => nodeResponse.setHeader(key, value));

  if (isHead || !fetchResponse.body) {
    nodeResponse.end();
    return;
  }

  for await (const chunk of fetchResponse.body) {
    nodeResponse.write(Buffer.from(chunk));
  }

  nodeResponse.end();
}

function containedPath(root, requestPath) {
  const normalized = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = resolve(root, normalized);

  return fullPath === root || fullPath.startsWith(`${root}${sep}`) ? fullPath : undefined;
}

function contentTypeFor(pathname) {
  return MIME_TYPES[extname(pathname).toLowerCase()] ?? 'application/octet-stream';
}

function cacheControlFor(pathname) {
  if (pathname.includes(`${sep}assets${sep}`)) {
    return 'public, immutable, max-age=31536000';
  }

  if (pathname.endsWith(`${sep}sw.js`) || pathname.endsWith(`${sep}manifest.webmanifest`)) {
    return 'no-cache';
  }

  return 'no-cache';
}

async function existingFile(pathname) {
  try {
    const stats = await stat(pathname);

    if (stats.isFile()) {
      return pathname;
    }

    if (stats.isDirectory()) {
      const indexPath = join(pathname, 'index.html');
      const indexStats = await stat(indexPath);

      return indexStats.isFile() ? indexPath : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function serveFile(nodeRequest, nodeResponse, pathname) {
  nodeResponse.statusCode = 200;
  nodeResponse.setHeader('Content-Type', contentTypeFor(pathname));
  nodeResponse.setHeader('Cache-Control', cacheControlFor(pathname));

  if (nodeRequest.method === 'HEAD') {
    nodeResponse.end();
    return;
  }

  createReadStream(pathname).pipe(nodeResponse);
}

async function serveStatic(nodeRequest, nodeResponse, staticRoot) {
  if (nodeRequest.method !== 'GET' && nodeRequest.method !== 'HEAD') {
    nodeResponse.statusCode = 405;
    nodeResponse.setHeader('Allow', 'GET, HEAD');
    nodeResponse.end('Method not allowed');
    return;
  }

  const url = new URL(nodeRequest.url ?? '/', 'http://localhost');
  const requestPath = decodeURIComponent(url.pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const requestedPath = containedPath(staticRoot, relativePath);

  if (!requestedPath) {
    nodeResponse.statusCode = 403;
    nodeResponse.end('Forbidden');
    return;
  }

  const filePath = await existingFile(requestedPath);

  if (filePath) {
    await serveFile(nodeRequest, nodeResponse, filePath);
    return;
  }

  if (requestPath.startsWith('/assets/')) {
    nodeResponse.statusCode = 404;
    nodeResponse.end('Not found');
    return;
  }

  const fallbackPath = await existingFile(join(staticRoot, 'index.html'));

  if (fallbackPath) {
    await serveFile(nodeRequest, nodeResponse, fallbackPath);
    return;
  }

  nodeResponse.statusCode = 404;
  nodeResponse.end('Not found');
}

export function createFileKvStore(filePath) {
  let writeChain = Promise.resolve();

  async function readValues() {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  }

  async function writeValues(values) {
    await mkdir(dirname(filePath), { recursive: true });

    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

    await writeFile(tempPath, JSON.stringify(values, null, 2));
    await rename(tempPath, filePath);
  }

  return {
    async get(key) {
      const values = await readValues();
      const value = values[key];

      return typeof value === 'string' ? value : null;
    },
    async put(key, value) {
      writeChain = writeChain.catch(() => undefined).then(async () => {
        const values = await readValues();

        values[key] = value;
        await writeValues(values);
      });

      return writeChain;
    }
  };
}

export function createNodeServer({ staticRoot, env, worker }) {
  const resolvedStaticRoot = resolve(staticRoot);

  return createHttpServer(async (nodeRequest, nodeResponse) => {
    try {
      const url = new URL(nodeRequest.url ?? '/', 'http://localhost');

      if (isApiPath(url.pathname) || nodeRequest.method === 'OPTIONS') {
        const fetchResponse = await worker.fetch(nodeRequestToFetch(nodeRequest), env, {});

        await writeFetchResponse(nodeResponse, fetchResponse, nodeRequest.method === 'HEAD');
        return;
      }

      await serveStatic(nodeRequest, nodeResponse, resolvedStaticRoot);
    } catch (error) {
      nodeResponse.statusCode = 500;
      nodeResponse.setHeader('Content-Type', 'application/json');
      nodeResponse.end(JSON.stringify({ error: 'Internal server error' }));
      console.error(error);
    }
  });
}

export function createDefaultEnv(dataDir) {
  return {
    PROXY_ACCESS_TOKEN: process.env.PROXY_ACCESS_TOKEN,
    AUTH_USERS: createFileKvStore(join(dataDir, 'auth-users.json')),
    SYNC_SETTINGS: createFileKvStore(join(dataDir, 'sync-settings.json'))
  };
}

export function serverHostFromEnv(env = process.env) {
  return env.HOST?.trim() || '127.0.0.1';
}

async function main() {
  const proxyModulePath = './proxy.mjs';
  const { default: worker } = await import(proxyModulePath);
  const port = Number.parseInt(process.env.PORT ?? '3003', 10);
  const host = serverHostFromEnv();
  const staticRoot = process.env.CHATONPHONE_STATIC_ROOT ?? resolve(process.cwd(), 'dist');
  const dataDir = process.env.CHATONPHONE_DATA_DIR ?? resolve(process.cwd(), 'data');
  const server = createNodeServer({
    staticRoot,
    env: createDefaultEnv(dataDir),
    worker
  });

  server.listen(port, host, () => {
    console.log(`ChatOnPhone server listening on ${host}:${port}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
