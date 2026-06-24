export type WorkerFetch = typeof fetch;

export type SyncSettingsStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export type ProxyWorkerEnv = {
  PROXY_ACCESS_TOKEN?: string;
  SYNC_SETTINGS?: SyncSettingsStore;
  AUTH_USERS?: SyncSettingsStore;
};

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const SYNC_ALLOWED_METHODS = 'GET, PUT, OPTIONS';
const PASSWORD_HASH_ITERATIONS = 120_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Target-Base-URL, X-Proxy-Access-Token'
};

const SYNC_CORS_HEADERS = {
  ...CORS_HEADERS,
  'Access-Control-Allow-Methods': SYNC_ALLOWED_METHODS
};

type AuthRequestBody = {
  accountId?: unknown;
  password?: unknown;
};

type UserRecord = {
  accountId: string;
  passwordSalt: string;
  passwordHash: string;
  tokenHashes?: string[];
  tokenHash?: string;
};

function jsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

function syncJsonResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SYNC_CORS_HEADERS,
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeOpenAIBasePath(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  const endpointSuffixes = ['/chat/completions', '/models'];
  let normalizedPath = withoutTrailingSlash;

  for (const suffix of endpointSuffixes) {
    if (normalizedPath.endsWith(suffix)) {
      normalizedPath = normalizedPath.slice(0, -suffix.length);
      break;
    }
  }

  if (!normalizedPath || normalizedPath === '/') {
    return '/v1';
  }

  return normalizedPath;
}

function getConfiguredProxyToken(env: ProxyWorkerEnv): string | undefined {
  const token = env.PROXY_ACCESS_TOKEN?.trim();

  return token ? token : undefined;
}

function getUpstreamUrl(targetBaseUrl: string): string | undefined {
  try {
    const url = new URL(targetBaseUrl);

    if (url.protocol !== 'https:' || url.search || url.hash) {
      return undefined;
    }

    url.pathname = normalizeOpenAIBasePath(url.pathname);

    return trimTrailingSlash(url.toString());
  } catch {
    return undefined;
  }
}

function upstreamPathFor(request: Request): string | undefined {
  const pathname = new URL(request.url).pathname;

  if (pathname === '/v1/chat/completions') {
    return '/chat/completions';
  }

  if (pathname === '/v1/models') {
    return '/models';
  }

  return undefined;
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('Authorization')?.trim();

  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }

  const token = authorization.slice('Bearer '.length).trim();

  return token.length > 0 ? token : undefined;
}

function getSyncAccountId(request: Request): string | undefined {
  const url = new URL(request.url);
  const prefix = '/sync/settings/';

  if (!url.pathname.startsWith(prefix)) {
    return undefined;
  }

  const accountId = decodeURIComponent(url.pathname.slice(prefix.length)).trim();

  return /^[A-Za-z0-9._-]{3,80}$/.test(accountId) ? accountId : undefined;
}

function isValidAccountId(accountId: string): boolean {
  return /^[A-Za-z0-9._-]{3,80}$/.test(accountId);
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);

  return bytesToHex(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

  return bytesToHex(new Uint8Array(digest));
}

async function syncStorageKey(accountId: string, token: string): Promise<string> {
  return `settings:${accountId}:${await sha256Hex(token)}`;
}

async function passwordHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

function authUserKey(accountId: string): string {
  return `user:${accountId}`;
}

async function readUserRecord(env: ProxyWorkerEnv, accountId: string): Promise<UserRecord | null> {
  const stored = await env.AUTH_USERS?.get(authUserKey(accountId));

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as UserRecord;
  } catch {
    return null;
  }
}

async function issueAccessToken(record: UserRecord): Promise<{ record: UserRecord; accessToken: string }> {
  const accessToken = randomHex(32);
  const tokenHash = await sha256Hex(accessToken);
  const tokenHashes = [...(record.tokenHashes ?? (record.tokenHash ? [record.tokenHash] : [])), tokenHash];

  return {
    accessToken,
    record: {
      ...record,
      tokenHashes: [...new Set(tokenHashes)].slice(-20),
      tokenHash: undefined
    }
  };
}

async function resolveSyncStorageKey(env: ProxyWorkerEnv, accountId: string, token: string): Promise<string | undefined> {
  if (!env.AUTH_USERS) {
    return syncStorageKey(accountId, token);
  }

  const record = await readUserRecord(env, accountId);

  if (!record) {
    return undefined;
  }

  const tokenHash = await sha256Hex(token);
  const tokenHashes = record.tokenHashes ?? (record.tokenHash ? [record.tokenHash] : []);

  return tokenHashes.includes(tokenHash) ? `settings:${accountId}` : undefined;
}

export async function handleProxyRequest(request: Request, fetchImpl: WorkerFetch = fetch, env: ProxyWorkerEnv = {}): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const upstreamPath = upstreamPathFor(request);
  const isAllowedMethod =
    (upstreamPath === '/chat/completions' && request.method === 'POST') ||
    (upstreamPath === '/models' && request.method === 'GET');

  if (!upstreamPath || !isAllowedMethod) {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: ALLOWED_METHODS });
  }

  const proxyToken = getConfiguredProxyToken(env);

  if (proxyToken && request.headers.get('X-Proxy-Access-Token')?.trim() !== proxyToken) {
    return jsonResponse({ error: 'Invalid proxy access token' }, 401);
  }

  const targetBaseUrl = request.headers.get('X-Target-Base-URL');
  const authorization = request.headers.get('Authorization');

  if (!targetBaseUrl) {
    return jsonResponse({ error: 'Missing X-Target-Base-URL header' }, 400);
  }

  if (!authorization) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const upstreamBaseUrl = getUpstreamUrl(targetBaseUrl);

  if (!upstreamBaseUrl) {
    return jsonResponse({ error: 'Invalid X-Target-Base-URL header' }, 400);
  }

  let upstream: Response;

  try {
    const requestInit: RequestInit = {
      method: request.method,
      headers: {
        Authorization: authorization,
        'Content-Type': request.headers.get('Content-Type') ?? 'application/json'
      }
    };

    if (request.method !== 'GET') {
      requestInit.body = request.body;
      (requestInit as RequestInit & { duplex: 'half' }).duplex = 'half';
    }

    upstream = await fetchImpl(`${upstreamBaseUrl}${upstreamPath}`, requestInit);
  } catch {
    return jsonResponse({ error: 'Upstream request failed' }, 502);
  }

  const responseHeaders = new Headers(upstream.headers);

  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

export async function handleSyncSettingsRequest(request: Request, env: ProxyWorkerEnv = {}): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: SYNC_CORS_HEADERS });
  }

  if (request.method !== 'GET' && request.method !== 'PUT') {
    return syncJsonResponse({ error: 'Method not allowed' }, 405, { Allow: SYNC_ALLOWED_METHODS });
  }

  if (!env.SYNC_SETTINGS) {
    return syncJsonResponse({ error: 'Sync storage is not configured' }, 503);
  }

  const accountId = getSyncAccountId(request);

  if (!accountId) {
    return syncJsonResponse({ error: 'Invalid account id' }, 400);
  }

  const token = getBearerToken(request);

  if (!token) {
    return syncJsonResponse({ error: 'Missing account authorization' }, 401);
  }

  const key = await resolveSyncStorageKey(env, accountId, token);

  if (!key) {
    return syncJsonResponse({ error: 'Invalid account authorization' }, 401);
  }

  if (request.method === 'GET') {
    const stored = await env.SYNC_SETTINGS.get(key);

    if (!stored) {
      return syncJsonResponse({ error: 'Settings not found' }, 404);
    }

    return syncJsonResponse({ settings: JSON.parse(stored) }, 200);
  }

  let body: { settings?: unknown };

  try {
    body = await request.json() as { settings?: unknown };
  } catch {
    return syncJsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.settings !== 'object' || body.settings === null) {
    return syncJsonResponse({ error: 'Missing settings body' }, 400);
  }

  await env.SYNC_SETTINGS.put(key, JSON.stringify(body.settings));

  return new Response(null, { status: 204, headers: SYNC_CORS_HEADERS });
}

export async function handleAuthRequest(request: Request, env: ProxyWorkerEnv = {}): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: ALLOWED_METHODS });
  }

  if (!env.AUTH_USERS) {
    return jsonResponse({ error: 'Auth storage is not configured' }, 503);
  }

  const pathname = new URL(request.url).pathname;
  const action = pathname === '/auth/register' ? 'register' : pathname === '/auth/login' ? 'login' : undefined;

  if (!action) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  let body: AuthRequestBody;

  try {
    body = await request.json() as AuthRequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!isValidAccountId(accountId) || password.length === 0) {
    return jsonResponse({ error: 'Invalid account credentials' }, 400);
  }

  const existingRecord = await readUserRecord(env, accountId);

  if (action === 'register') {
    if (existingRecord) {
      return jsonResponse({ error: 'Account already exists' }, 409);
    }

    const passwordSalt = randomHex(16);
    const initialRecord: UserRecord = {
      accountId,
      passwordSalt,
      passwordHash: await passwordHash(password, passwordSalt),
      tokenHashes: []
    };
    const issued = await issueAccessToken(initialRecord);

    await env.AUTH_USERS.put(authUserKey(accountId), JSON.stringify(issued.record));

    return jsonResponse({ accountId, accessToken: issued.accessToken }, 201);
  }

  if (!existingRecord) {
    return jsonResponse({ error: 'Invalid account credentials' }, 401);
  }

  const incomingPasswordHash = await passwordHash(password, existingRecord.passwordSalt);

  if (incomingPasswordHash !== existingRecord.passwordHash) {
    return jsonResponse({ error: 'Invalid account credentials' }, 401);
  }

  const issued = await issueAccessToken(existingRecord);

  await env.AUTH_USERS.put(authUserKey(accountId), JSON.stringify(issued.record));

  return jsonResponse({ accountId, accessToken: issued.accessToken }, 200);
}

export default {
  fetch(request: Request, env: ProxyWorkerEnv = {}, _ctx?: unknown): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/auth/')) {
      return handleAuthRequest(request, env);
    }

    if (url.pathname.startsWith('/sync/settings/')) {
      return handleSyncSettingsRequest(request, env);
    }

    return handleProxyRequest(request, fetch, env);
  }
};
