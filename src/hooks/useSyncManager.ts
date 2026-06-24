import { useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../domain/types';
import { classifyChatError } from '../domain/errors';
import { downloadSyncedSettings, uploadSyncedSettings } from '../sync/settingsSync';

const SYNC_RESUME_MIN_INTERVAL_MS = 5000;

export interface UseSyncManagerReturn {
  syncStatus: string;
  setSyncStatus: (status: string) => void;
  pullSyncedSettings: (reason: 'startup' | 'resume', currentSettings: AppSettings) => Promise<AppSettings | null>;
  uploadSettings: (settings: AppSettings) => Promise<void>;
  markAccountSynced: (settings: AppSettings, shareAcrossManagers?: boolean) => void;
}

function hasAuthenticatedAccount(settings: AppSettings): boolean {
  return Boolean(settings.syncAccount?.accessToken.trim());
}

function shouldAutoSyncAccount(settings: AppSettings): boolean {
  return hasAuthenticatedAccount(settings) && settings.syncAccount?.autoSync !== false;
}

function syncAccountKey(settings: AppSettings): string {
  const account = settings.syncAccount;

  if (!account) {
    return '';
  }

  return [account.endpoint.trim(), account.accountId.trim(), account.accessToken.trim()].join('|');
}

function providerSyncSignature(settings: AppSettings): string {
  return JSON.stringify({
    apiBaseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    requestMode: settings.requestMode,
    proxyUrl: settings.proxyUrl,
    proxyAccessToken: settings.proxyAccessToken,
    providers: settings.providers,
    selectedProviderId: settings.selectedProviderId,
    selectedModel: settings.selectedModel
  });
}

let recentlySyncedAccountKey = '';

export function useSyncManager(): UseSyncManagerReturn {
  const [syncStatus, setSyncStatus] = useState('');
  const syncPullInFlightRef = useRef<Promise<void> | null>(null);
  const lastAccountSyncKeyRef = useRef('');
  const lastSyncPullAtRef = useRef(0);

  function markAccountSynced(accountSettings: AppSettings, shareAcrossManagers = false) {
    lastAccountSyncKeyRef.current = syncAccountKey(accountSettings);
    lastSyncPullAtRef.current = Date.now();

    if (shareAcrossManagers) {
      recentlySyncedAccountKey = lastAccountSyncKeyRef.current;
    }
  }

  async function pullSyncedSettings(reason: 'startup' | 'resume', currentSettings: AppSettings): Promise<AppSettings | null> {
    if (!shouldAutoSyncAccount(currentSettings)) {
      return null;
    }

    const currentAccountKey = syncAccountKey(currentSettings);
    const now = Date.now();

    if (reason === 'startup' && lastAccountSyncKeyRef.current === currentAccountKey) {
      return null;
    }

    if (reason === 'startup' && recentlySyncedAccountKey === currentAccountKey) {
      recentlySyncedAccountKey = '';
      lastAccountSyncKeyRef.current = currentAccountKey;
      lastSyncPullAtRef.current = now;
      return null;
    }

    if (reason === 'resume' && now - lastSyncPullAtRef.current < SYNC_RESUME_MIN_INTERVAL_MS) {
      return null;
    }

    if (syncPullInFlightRef.current) {
      await syncPullInFlightRef.current;
      return null;
    }

    let resolvedSettings: AppSettings | null = null;

    const syncPull = (async () => {
      try {
        const account = currentSettings.syncAccount!;
        const downloadedSettings = await downloadSyncedSettings(account, currentSettings);

        const mergedSettings = {
          ...downloadedSettings,
          syncAccount: account
        };

        markAccountSynced(mergedSettings);
        setSyncStatus(reason === 'startup' ? '已同步账号设置' : '同步已更新');

        resolvedSettings = mergedSettings;
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          lastSyncPullAtRef.current = Date.now();
          setSyncStatus('暂无远端设置');
          return;
        }

        const classified = classifyChatError(error);
        setSyncStatus(`同步拉取失败：${classified.detail}`);
      } finally {
        syncPullInFlightRef.current = null;
      }
    })();

    syncPullInFlightRef.current = syncPull;
    await syncPull;
    return resolvedSettings;
  }

  async function uploadSettings(settings: AppSettings): Promise<void> {
    try {
      await uploadSyncedSettings(settings);
      setSyncStatus('同步已上传');
    } catch (error) {
      const classified = classifyChatError(error);
      throw new Error(`同步上传失败：${classified.detail}`);
    }
  }

  return {
    syncStatus,
    setSyncStatus,
    pullSyncedSettings,
    uploadSettings,
    markAccountSynced
  };
}

// Hook for auto-sync on startup and resume
export function useAutoSync(settings: AppSettings, pullSyncedSettings: (reason: 'startup' | 'resume', currentSettings: AppSettings) => Promise<AppSettings | null>, onSettingsUpdated: (settings: AppSettings) => void) {
  useEffect(() => {
    if (!shouldAutoSyncAccount(settings)) {
      return;
    }

    void pullSyncedSettings('startup', settings).then((updated) => {
      if (updated) {
        onSettingsUpdated(updated);
      }
    });
  }, [settings.syncAccount?.endpoint, settings.syncAccount?.accountId, settings.syncAccount?.accessToken]);

  useEffect(() => {
    if (!shouldAutoSyncAccount(settings)) {
      return;
    }

    function handleResume() {
      if (document.visibilityState === 'visible') {
        void pullSyncedSettings('resume', settings).then((updated) => {
          if (updated) {
            onSettingsUpdated(updated);
          }
        });
      }
    }

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [settings.syncAccount?.endpoint, settings.syncAccount?.accountId, settings.syncAccount?.accessToken]);
}

export { hasAuthenticatedAccount, shouldAutoSyncAccount, providerSyncSignature };
