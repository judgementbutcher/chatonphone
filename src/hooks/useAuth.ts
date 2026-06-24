import { useState } from 'react';
import type { AppSettings, SyncAccountSettings } from '../domain/types';
import { loginAccount, registerAccount } from '../auth/authClient';
import { classifyChatError } from '../domain/errors';

export type AuthAction = 'register' | 'login';

export interface UseAuthReturn {
  authAccountId: string;
  setAuthAccountId: (id: string) => void;
  authPassword: string;
  setAuthPassword: (password: string) => void;
  authError: string;
  setAuthError: (error: string) => void;
  isAuthenticating: boolean;
  handleAuth: (action: AuthAction, settings: AppSettings) => Promise<SyncAccountSettings | null>;
}

function accountSettingsFrom(settings: AppSettings, accountId: string): AppSettings {
  return {
    ...settings,
    syncAccount: {
      endpoint: settings.syncAccount?.endpoint ?? '',
      accountId,
      accessToken: '',
      autoSync: true
    }
  };
}

function authPayloadFrom(nextSettings: AppSettings, password: string) {
  const account = nextSettings.syncAccount;

  if (!account) {
    throw new Error('同步账号信息不完整。');
  }

  return {
    endpoint: account.endpoint,
    accountId: account.accountId,
    password,
    autoSync: true
  };
}

export function useAuth(initialAccountId = ''): UseAuthReturn {
  const [authAccountId, setAuthAccountId] = useState(initialAccountId);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  async function handleAuth(action: AuthAction, settings: AppSettings): Promise<SyncAccountSettings | null> {
    if (isAuthenticating) {
      return null;
    }

    setIsAuthenticating(true);
    setAuthError('');

    const baseSettings = accountSettingsFrom(settings, authAccountId);

    try {
      if (action === 'register') {
        const account = await registerAccount(authPayloadFrom(baseSettings, authPassword));
        setAuthPassword('');
        return account;
      }

      const account = await loginAccount(authPayloadFrom(baseSettings, authPassword));
      setAuthPassword('');
      return account;
    } catch (error) {
      const classified = classifyChatError(error);
      setAuthError(`${classified.title}：${classified.detail}`);
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  }

  return {
    authAccountId,
    setAuthAccountId,
    authPassword,
    setAuthPassword,
    authError,
    setAuthError,
    isAuthenticating,
    handleAuth
  };
}
