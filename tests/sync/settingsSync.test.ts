import { describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../src/settings/settingsStore';
import { downloadSyncedSettings, uploadSyncedSettings } from '../../src/sync/settingsSync';

const account = {
  endpoint: 'https://sync.example.com',
  accountId: 'desktop-user',
  accessToken: 'account-secret',
  autoSync: true
};

const sameOriginAccount = {
  ...account,
  endpoint: ''
};

const settings = {
  ...defaultSettings,
  syncAccount: account,
  selectedProviderId: 'openrouter',
  selectedModel: 'anthropic/claude-3.5-sonnet',
  providers: [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret',
      requestMode: 'proxy' as const,
      proxyUrl: 'https://proxy.example.com',
      proxyAccessToken: 'proxy-secret',
      models: ['anthropic/claude-3.5-sonnet']
    }
  ]
};

describe('settings sync client', () => {
  it('uploads provider settings to the account endpoint without storing the sync token in the payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await uploadSyncedSettings(settings, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://sync.example.com/sync/settings/desktop-user', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer account-secret',
        'Content-Type': 'application/json'
      })
    }));

    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);

    expect(body.settings.providers[0]).toMatchObject({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret'
    });
    expect(body.settings.temperature).toBeUndefined();
    expect(body.settings.maxTokens).toBeUndefined();
    expect(body.settings.stream).toBeUndefined();
    expect(body.settings.darkMode).toBeUndefined();
    expect(body.settings.syncAccount.accessToken).toBe('');
  });

  it('downloads provider settings and keeps local-only settings on the device', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      settings: {
        ...settings,
        selectedModel: 'google/gemini-2.5-pro',
        temperature: 1.7,
        maxTokens: 512,
        stream: false,
        darkMode: false,
        syncAccount: {
          endpoint: 'https://sync.example.com',
          accountId: 'desktop-user',
          accessToken: 'remote-token',
          autoSync: false
        }
      }
    }), { status: 200 }));
    const currentSettings = {
      ...defaultSettings,
      temperature: 0.2,
      maxTokens: 4096,
      stream: true,
      darkMode: true
    };

    const downloaded = await downloadSyncedSettings(account, currentSettings, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://sync.example.com/sync/settings/desktop-user', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer account-secret'
      })
    }));
    expect(downloaded.selectedModel).toBe('google/gemini-2.5-pro');
    expect(downloaded.temperature).toBe(0.2);
    expect(downloaded.maxTokens).toBe(4096);
    expect(downloaded.stream).toBe(true);
    expect(downloaded.darkMode).toBe(true);
    expect(downloaded.syncAccount).toEqual(account);
  });

  it('uses the current app origin when no sync endpoint is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await uploadSyncedSettings({ ...settings, syncAccount: sameOriginAccount }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/sync/settings/desktop-user', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer account-secret'
      })
    }));
  });
});
