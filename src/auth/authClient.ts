import type { SyncAccountSettings } from '../domain/types';

export type FetchLike = typeof fetch;

interface AuthPayload {
  endpoint: string;
  accountId: string;
  password: string;
  autoSync: boolean;
}

interface AuthResponseBody {
  accountId: string;
  accessToken: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function authUrl(endpoint: string, action: 'register' | 'login'): string {
  const base = trimTrailingSlash(endpoint.trim());

  return `${base}/auth/${action}`;
}

function assertAuthPayload(payload: AuthPayload): void {
  if (!payload.accountId.trim() || !payload.password) {
    throw new Error('账号和密码不能为空。');
  }
}

async function requestAccount(
  action: 'register' | 'login',
  payload: AuthPayload,
  fetchImpl: FetchLike
): Promise<SyncAccountSettings> {
  assertAuthPayload(payload);

  const response = await fetchImpl(authUrl(payload.endpoint, action), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountId: payload.accountId,
      password: payload.password
    })
  });

  if (!response.ok) {
    throw response;
  }

  const body = await response.json() as AuthResponseBody;

  return {
    endpoint: payload.endpoint,
    accountId: body.accountId,
    accessToken: body.accessToken,
    autoSync: payload.autoSync
  };
}

export function registerAccount(payload: AuthPayload, fetchImpl: FetchLike = fetch): Promise<SyncAccountSettings> {
  return requestAccount('register', payload, fetchImpl);
}

export function loginAccount(payload: AuthPayload, fetchImpl: FetchLike = fetch): Promise<SyncAccountSettings> {
  return requestAccount('login', payload, fetchImpl);
}
