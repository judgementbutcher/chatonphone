import { beforeEach, describe, expect, it } from 'vitest';
import { clearSettings, defaultProvider, defaultSettings, getActiveProviderSettings, loadSettings, saveSettings } from '../../src/settings/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default settings when storage is empty', () => {
    expect(loadSettings()).toEqual(defaultSettings);
  });

  it('persists user settings', () => {
    saveSettings({
      ...defaultSettings,
      apiBaseUrl: 'https://gateway.example.com/v1',
      apiKey: 'secret',
      model: 'gpt-4o-mini',
      requestMode: 'proxy',
      darkMode: true
    });

    expect(loadSettings()).toMatchObject({
      apiBaseUrl: 'https://gateway.example.com/v1',
      apiKey: 'secret',
      model: 'gpt-4o-mini',
      requestMode: 'proxy',
      darkMode: true
    });
  });

  it('clears saved settings', () => {
    saveSettings({ ...defaultSettings, apiKey: 'secret' });

    clearSettings();

    expect(loadSettings()).toEqual(defaultSettings);
  });

  it('falls back per field when persisted settings have invalid shapes', () => {
    localStorage.setItem(
      'chatonphone.settings.v1',
      JSON.stringify({
        apiBaseUrl: 123,
        apiKey: 'secret',
        model: null,
        temperature: '0.3',
        maxTokens: -1,
        stream: 'true',
        requestMode: 'invalid',
        proxyUrl: 'https://proxy.example.com',
        proxyAccessToken: false
      })
    );

    expect(loadSettings()).toEqual({
      ...defaultSettings,
      apiKey: 'secret',
      proxyUrl: 'https://proxy.example.com',
      providers: [
        {
          ...defaultProvider,
          apiKey: 'secret',
          proxyUrl: 'https://proxy.example.com'
        }
      ]
    });
  });

  it('migrates legacy single-provider settings into the provider list', () => {
    localStorage.setItem(
      'chatonphone.settings.v1',
      JSON.stringify({
        apiBaseUrl: 'https://legacy.example.com/v1',
        apiKey: 'legacy-secret',
        model: 'legacy-model',
        requestMode: 'proxy',
        proxyUrl: 'https://proxy.example.com',
        proxyAccessToken: 'proxy-secret',
        temperature: 0.4,
        maxTokens: 4096,
        stream: false
      })
    );

    expect(loadSettings()).toMatchObject({
      apiBaseUrl: 'https://legacy.example.com/v1',
      apiKey: 'legacy-secret',
      model: 'legacy-model',
      selectedProviderId: 'default',
      selectedModel: 'legacy-model',
      providers: [
        {
          id: 'default',
          name: '默认供应商',
          apiBaseUrl: 'https://legacy.example.com/v1',
          apiKey: 'legacy-secret',
          requestMode: 'proxy',
          proxyUrl: 'https://proxy.example.com',
          proxyAccessToken: 'proxy-secret',
          models: ['legacy-model']
        }
      ]
    });
  });

  it('persists multiple providers and resolves the active provider settings', () => {
    const settings = {
      ...defaultSettings,
      selectedProviderId: 'openrouter',
      selectedModel: 'anthropic/claude-3.5-sonnet',
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          apiBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'openai-secret',
          requestMode: 'direct' as const,
          proxyUrl: '',
          proxyAccessToken: '',
          models: ['gpt-4o-mini', 'gpt-4.1-mini']
        },
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

    saveSettings(settings);

    const loaded = loadSettings();

    expect(loaded.providers).toHaveLength(2);
    expect(getActiveProviderSettings(loaded)).toMatchObject({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret',
      model: 'anthropic/claude-3.5-sonnet',
      requestMode: 'proxy',
      proxyUrl: 'https://proxy.example.com',
      proxyAccessToken: 'proxy-secret'
    });
  });
});
