// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import proxyWorker from '../../worker/proxy';

const tempRoots: string[] = [];
const nativeFetch = globalThis.fetch.bind(globalThis);

async function tempRoot() {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'chatonphone-server-'));

  tempRoots.push(root);

  return root;
}

async function writeStaticShell(staticRoot: string, html: string) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  await mkdir(staticRoot, { recursive: true });
  await writeFile(join(staticRoot, 'index.html'), html);
}

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');

  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

beforeEach(() => {
  vi.stubGlobal('fetch', nativeFetch);
});

describe('chatonphone node server', () => {
  it('recovers file kv writes after a transient write failure', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { createFileKvStore } = await import('../../server/chatonphone-server.mjs');
    const root = await tempRoot();
    const blockedPath = join(root, 'blocked');
    const store = createFileKvStore(join(blockedPath, 'store.json'));

    await writeFile(blockedPath, 'not a directory');
    await expect(store.put('key', 'first')).rejects.toThrow();
    await rm(blockedPath, { force: true });
    await mkdir(blockedPath);

    await store.put('key', 'second');

    await expect(store.get('key')).resolves.toBe('second');
  });

  it('uses an explicit host override for container runtimes', async () => {
    const { serverHostFromEnv } = await import('../../server/chatonphone-server.mjs');

    expect(serverHostFromEnv({})).toBe('127.0.0.1');
    expect(serverHostFromEnv({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
  });

  it('serves the app shell for deep links', async () => {
    const { join } = await import('node:path');
    const { createFileKvStore, createNodeServer } = await import('../../server/chatonphone-server.mjs');
    const root = await tempRoot();
    const staticRoot = join(root, 'dist');
    const dataRoot = join(root, 'data');

    await writeStaticShell(staticRoot, '<main>ChatOnPhone app shell</main>');

    const server = createNodeServer({
      staticRoot,
      env: {
        AUTH_USERS: createFileKvStore(join(dataRoot, 'auth-users.json')),
        SYNC_SETTINGS: createFileKvStore(join(dataRoot, 'sync-settings.json'))
      },
      worker: proxyWorker
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/settings/account`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toContain('ChatOnPhone app shell');
    } finally {
      server.close();
    }
  });

  it('persists auth and sync settings through the worker routes', async () => {
    const { join } = await import('node:path');
    const { createFileKvStore, createNodeServer } = await import('../../server/chatonphone-server.mjs');
    const root = await tempRoot();
    const staticRoot = join(root, 'dist');
    const dataRoot = join(root, 'data');

    await writeStaticShell(staticRoot, '<main>ChatOnPhone</main>');

    const server = createNodeServer({
      staticRoot,
      env: {
        AUTH_USERS: createFileKvStore(join(dataRoot, 'auth-users.json')),
        SYNC_SETTINGS: createFileKvStore(join(dataRoot, 'sync-settings.json'))
      },
      worker: proxyWorker
    });
    const baseUrl = await listen(server);

    try {
      const registerResponse = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      });
      const registered = await registerResponse.json();

      expect(registerResponse.status).toBe(201);
      expect(registered.accessToken).toEqual(expect.any(String));

      const uploadResponse = await fetch(`${baseUrl}/sync/settings/desktop-user`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${registered.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings: { selectedModel: 'synced-model' } })
      });

      expect(uploadResponse.status).toBe(204);

      const loginResponse = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      });
      const loggedIn = await loginResponse.json();

      expect(loginResponse.status).toBe(200);
      expect(loggedIn.accessToken).toEqual(expect.any(String));

      const downloadResponse = await fetch(`${baseUrl}/sync/settings/desktop-user`, {
        headers: {
          Authorization: `Bearer ${loggedIn.accessToken}`
        }
      });

      expect(downloadResponse.status).toBe(200);
      await expect(downloadResponse.json()).resolves.toMatchObject({
        settings: {
          selectedModel: 'synced-model'
        }
      });
    } finally {
      server.close();
    }
  });

  it('routes same-origin model list requests to the worker', async () => {
    const { join } = await import('node:path');
    const { createNodeServer } = await import('../../server/chatonphone-server.mjs');
    const root = await tempRoot();
    const staticRoot = join(root, 'dist');
    const worker = {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 }))
    };

    await writeStaticShell(staticRoot, '<main>ChatOnPhone</main>');

    const server = createNodeServer({
      staticRoot,
      env: {},
      worker
    });
    const baseUrl = await listen(server);

    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          Authorization: 'Bearer secret',
          'X-Target-Base-URL': 'https://gateway.example.com/v1'
        }
      });

      expect(response.status).toBe(200);
      expect(worker.fetch).toHaveBeenCalledOnce();
      await expect(response.json()).resolves.toEqual({ data: [{ id: 'gpt-4o-mini' }] });
    } finally {
      server.close();
    }
  });
});
