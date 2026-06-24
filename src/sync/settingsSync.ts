import type { AppSettings, SyncAccountSettings } from '../domain/types';
import { getActiveProviderSettings } from '../settings/settingsStore';

export type FetchLike = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function syncUrl(account: SyncAccountSettings): string {
  const base = trimTrailingSlash(account.endpoint.trim());

  return `${base}/sync/settings/${encodeURIComponent(account.accountId)}`;
}

function assertSyncAccount(account: SyncAccountSettings): void {
  if (!account.accountId.trim() || !account.accessToken.trim()) {
    throw new Error('同步账号信息不完整。');
  }
}

function providerSettingsPayload(settings: AppSettings): Partial<AppSettings> {
  const normalized = getActiveProviderSettings(settings);

  return {
    apiBaseUrl: normalized.apiBaseUrl,
    apiKey: normalized.apiKey,
    requestMode: normalized.requestMode,
    proxyUrl: normalized.proxyUrl,
    proxyAccessToken: normalized.proxyAccessToken,
    providers: normalized.providers,
    selectedProviderId: normalized.selectedProviderId,
    selectedModel: normalized.selectedModel,
    syncAccount: {
      endpoint: normalized.syncAccount?.endpoint ?? '',
      accountId: normalized.syncAccount?.accountId ?? '',
      accessToken: '',
      autoSync: normalized.syncAccount?.autoSync ?? false
    }
  };
}

export async function uploadSyncedSettings(settings: AppSettings, fetchImpl: FetchLike = fetch): Promise<void> {
  const account = settings.syncAccount;

  if (!account) {
    throw new Error('同步账号信息不完整。');
  }

  assertSyncAccount(account);

  const response = await fetchImpl(syncUrl(account), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      settings: providerSettingsPayload(settings)
    })
  });

  if (!response.ok) {
    throw response;
  }
}

export async function downloadSyncedSettings(
  account: SyncAccountSettings,
  currentSettings: AppSettings,
  fetchImpl: FetchLike = fetch
): Promise<AppSettings> {
  assertSyncAccount(account);

  const response = await fetchImpl(syncUrl(account), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${account.accessToken}`
    }
  });

  if (!response.ok) {
    throw response;
  }

  const data = await response.json() as { settings?: Partial<AppSettings> };

  if (!data.settings) {
    throw new Error('同步数据为空。');
  }

  const providerSettings = providerSettingsPayload({
    ...currentSettings,
    ...data.settings,
    syncAccount: account
  });

  return getActiveProviderSettings({
    ...currentSettings,
    ...providerSettings,
    syncAccount: account
  });
}
