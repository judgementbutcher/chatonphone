import { afterEach, describe, expect, it, vi } from 'vitest';
import proxyWorker, { handleAuthRequest, handleProxyRequest, handleSyncSettingsRequest } from '../../worker/proxy';

type ProxyEnv = {
  PROXY_ACCESS_TOKEN?: string;
  SYNC_SETTINGS?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  AUTH_USERS?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
};

type ProxyHandler = (
  request: Request,
  fetchImpl?: typeof fetch,
  env?: ProxyEnv
) => Promise<Response>;

type ProxyWorkerModule = {
  fetch: (request: Request, env?: ProxyEnv, ctx?: unknown) => Promise<Response>;
};

function createSyncStore() {
  const values = new Map<string, string>();

  return {
    values,
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    }
  };
}

function createAuthStore() {
  return createSyncStore();
}

const handleProxyRequestWithEnv = handleProxyRequest as ProxyHandler;
const workerModule = proxyWorker as ProxyWorkerModule;

function createChatRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://proxy.example.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
      'X-Target-Base-URL': 'https://gateway.example.com/v1',
      ...headers
    },
    body: JSON.stringify({ model: 'vision-model', messages: [] })
  });
}

function expectCorsHeaders(response: Response, methods = 'GET, POST, OPTIONS'): void {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(response.headers.get('Access-Control-Allow-Methods')).toBe(methods);
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type, X-Target-Base-URL, X-Proxy-Access-Token');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleProxyRequest', () => {
  it('forwards chat completions to the target base url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const request = createChatRequest();

    const response = await handleProxyRequest(request, fetchImpl);

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json'
      })
    }));
  });

  it('normalizes root and full endpoint target base urls', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await handleProxyRequest(createChatRequest({ 'X-Target-Base-URL': 'https://gateway.example.com' }), fetchImpl);
    await handleProxyRequest(createChatRequest({ 'X-Target-Base-URL': 'https://gateway.example.com/v1/chat/completions' }), fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toBe('https://gateway.example.com/v1/chat/completions');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://gateway.example.com/v1/chat/completions');
  });

  it('forwards model list requests to the target base url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 }));
    const request = new Request('https://proxy.example.com/v1/models', {
      headers: {
        Authorization: 'Bearer secret',
        'X-Target-Base-URL': 'https://gateway.example.com/v1'
      }
    });

    const response = await handleProxyRequest(request, fetchImpl);

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret'
      })
    }));
  });

  it('rejects requests without target base url', async () => {
    const response = await handleProxyRequest(new Request('https://proxy.example.com/v1/chat/completions', { method: 'POST' }), vi.fn());

    expect(response.status).toBe(400);
    expectCorsHeaders(response);
  });

  it('handles options preflight with cors headers', async () => {
    const fetchImpl = vi.fn();
    const response = await handleProxyRequest(new Request('https://proxy.example.com/v1/chat/completions', { method: 'OPTIONS' }), fetchImpl);

    expect(response.status).toBe(204);
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects requests without authorization', async () => {
    const fetchImpl = vi.fn();
    const request = new Request('https://proxy.example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'X-Target-Base-URL': 'https://gateway.example.com/v1'
      },
      body: JSON.stringify({ model: 'vision-model', messages: [] })
    });

    const response = await handleProxyRequest(request, fetchImpl);

    expect(response.status).toBe(401);
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('adds allow header to method not allowed responses', async () => {
    const fetchImpl = vi.fn();
    const response = await handleProxyRequest(new Request('https://proxy.example.com/v1/chat/completions', { method: 'GET' }), fetchImpl);

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, POST, OPTIONS');
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts matching proxy access token when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const request = createChatRequest({ 'X-Proxy-Access-Token': 'proxy-secret' });

    const response = await handleProxyRequestWithEnv(request, fetchImpl, { PROXY_ACCESS_TOKEN: ' proxy-secret ' });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.com/v1/chat/completions', expect.objectContaining({
      headers: expect.not.objectContaining({
        'X-Proxy-Access-Token': 'proxy-secret'
      })
    }));
  });

  it('rejects missing proxy access token when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const response = await handleProxyRequestWithEnv(createChatRequest(), fetchImpl, { PROXY_ACCESS_TOKEN: 'proxy-secret' });

    expect(response.status).toBe(401);
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects mismatched proxy access token when configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const request = createChatRequest({ 'X-Proxy-Access-Token': 'wrong-secret' });

    const response = await handleProxyRequestWithEnv(request, fetchImpl, { PROXY_ACCESS_TOKEN: 'proxy-secret' });

    expect(response.status).toBe(401);
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts requests when no proxy access token is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const response = await handleProxyRequestWithEnv(createChatRequest(), fetchImpl, { PROXY_ACCESS_TOKEN: ' ' });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects invalid target base urls', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const request = createChatRequest({ 'X-Target-Base-URL': 'not a url' });

    const response = await handleProxyRequest(request, fetchImpl);

    expect(response.status).toBe(400);
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects non-https target base urls', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const request = createChatRequest({ 'X-Target-Base-URL': 'http://gateway.example.com/v1' });

    const response = await handleProxyRequest(request, fetchImpl);

    expect(response.status).toBe(400);
    expectCorsHeaders(response);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns bad gateway when upstream fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network failed'));

    const response = await handleProxyRequest(createChatRequest(), fetchImpl);

    expect(response.status).toBe(502);
    expectCorsHeaders(response);
  });
});

describe('default worker export', () => {
  it('uses global fetch when invoked with cloudflare module worker arguments', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await workerModule.fetch(
      createChatRequest({ 'X-Proxy-Access-Token': 'proxy-secret' }),
      { PROXY_ACCESS_TOKEN: 'proxy-secret' },
      {}
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.com/v1/chat/completions', expect.any(Object));
  });

  it('routes model list requests through the default worker export', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    const response = await workerModule.fetch(
      new Request('https://proxy.example.com/v1/models', {
        headers: {
          Authorization: 'Bearer secret',
          'X-Target-Base-URL': 'https://gateway.example.com/v1'
        }
      }),
      {},
      {}
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.com/v1/models', expect.any(Object));
  });
});

describe('handleSyncSettingsRequest', () => {
  it('stores and returns settings for the same account credential', async () => {
    const syncStore = createSyncStore();
    const putRequest = new Request('https://proxy.example.com/sync/settings/desktop-user', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer account-secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'anthropic/claude-3.5-sonnet',
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'openrouter-secret',
              requestMode: 'proxy',
              proxyUrl: 'https://proxy.example.com',
              proxyAccessToken: 'proxy-secret',
              models: ['anthropic/claude-3.5-sonnet']
            }
          ]
        }
      })
    });

    const putResponse = await handleSyncSettingsRequest(putRequest, { SYNC_SETTINGS: syncStore });

    expect(putResponse.status).toBe(204);

    const getResponse = await handleSyncSettingsRequest(
      new Request('https://proxy.example.com/sync/settings/desktop-user', {
        headers: {
          Authorization: 'Bearer account-secret'
        }
      }),
      { SYNC_SETTINGS: syncStore }
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      settings: {
        selectedProviderId: 'openrouter',
        providers: [
          {
            apiKey: 'openrouter-secret'
          }
        ]
      }
    });
  });

  it('does not return settings for a different token', async () => {
    const syncStore = createSyncStore();
    const putRequest = new Request('https://proxy.example.com/sync/settings/desktop-user', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer account-secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings: { selectedModel: 'private-model' } })
    });

    await handleSyncSettingsRequest(putRequest, { SYNC_SETTINGS: syncStore });

    const getResponse = await handleSyncSettingsRequest(
      new Request('https://proxy.example.com/sync/settings/desktop-user', {
        headers: {
          Authorization: 'Bearer other-secret'
        }
      }),
      { SYNC_SETTINGS: syncStore }
    );

    expect(getResponse.status).toBe(404);
  });

  it('rejects sync requests without account authorization', async () => {
    const response = await handleSyncSettingsRequest(
      new Request('https://proxy.example.com/sync/settings/desktop-user'),
      { SYNC_SETTINGS: createSyncStore() }
    );

    expect(response.status).toBe(401);
    expectCorsHeaders(response, 'GET, PUT, OPTIONS');
  });

  it('routes sync requests through the default worker export', async () => {
    const syncStore = createSyncStore();
    const response = await workerModule.fetch(
      new Request('https://proxy.example.com/sync/settings/desktop-user', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer account-secret',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings: { selectedModel: 'remote-model' } })
      }),
      { SYNC_SETTINGS: syncStore },
      {}
    );

    expect(response.status).toBe(204);
    expect(syncStore.values.size).toBe(1);
  });
});

describe('handleAuthRequest', () => {
  it('registers an account and logs in with the same password', async () => {
    const authStore = createAuthStore();
    const registerResponse = await handleAuthRequest(
      new Request('https://proxy.example.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      }),
      { AUTH_USERS: authStore }
    );

    expect(registerResponse.status).toBe(201);
    await expect(registerResponse.json()).resolves.toMatchObject({
      accountId: 'desktop-user',
      accessToken: expect.any(String)
    });

    const loginResponse = await handleAuthRequest(
      new Request('https://proxy.example.com/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      }),
      { AUTH_USERS: authStore }
    );

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toMatchObject({
      accountId: 'desktop-user',
      accessToken: expect.any(String)
    });
  });

  it('rejects duplicate registration and invalid login passwords', async () => {
    const authStore = createAuthStore();
    const requestBody = { accountId: 'desktop-user', password: 'correct horse battery staple' };

    await handleAuthRequest(
      new Request('https://proxy.example.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }),
      { AUTH_USERS: authStore }
    );

    const duplicateResponse = await handleAuthRequest(
      new Request('https://proxy.example.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }),
      { AUTH_USERS: authStore }
    );
    const loginResponse = await handleAuthRequest(
      new Request('https://proxy.example.com/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'wrong password' })
      }),
      { AUTH_USERS: authStore }
    );

    expect(duplicateResponse.status).toBe(409);
    expect(loginResponse.status).toBe(401);
  });

  it('uses login tokens to sync the same account settings across devices', async () => {
    const authStore = createAuthStore();
    const syncStore = createSyncStore();
    const registerResponse = await handleAuthRequest(
      new Request('https://proxy.example.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      }),
      { AUTH_USERS: authStore }
    );
    const registered = await registerResponse.json() as { accessToken: string };

    await handleSyncSettingsRequest(
      new Request('https://proxy.example.com/sync/settings/desktop-user', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${registered.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings: { selectedModel: 'desktop-model' } })
      }),
      { AUTH_USERS: authStore, SYNC_SETTINGS: syncStore }
    );

    const loginResponse = await handleAuthRequest(
      new Request('https://proxy.example.com/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      }),
      { AUTH_USERS: authStore }
    );
    const loggedIn = await loginResponse.json() as { accessToken: string };
    const getResponse = await handleSyncSettingsRequest(
      new Request('https://proxy.example.com/sync/settings/desktop-user', {
        headers: {
          Authorization: `Bearer ${loggedIn.accessToken}`
        }
      }),
      { AUTH_USERS: authStore, SYNC_SETTINGS: syncStore }
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      settings: {
        selectedModel: 'desktop-model'
      }
    });
  });

  it('routes auth requests through the default worker export', async () => {
    const authStore = createAuthStore();
    const response = await workerModule.fetch(
      new Request('https://proxy.example.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'desktop-user', password: 'correct horse battery staple' })
      }),
      { AUTH_USERS: authStore },
      {}
    );

    expect(response.status).toBe(201);
  });
});
