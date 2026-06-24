import type { AppSettings, ProviderSettings, RequestMode, SyncAccountSettings } from '../domain/types';

const SETTINGS_KEY = 'chatonphone.settings.v1';
const DEFAULT_PROVIDER_ID = 'default';
const requestModes = new Set(['auto', 'direct', 'proxy']);

export const defaultProvider: ProviderSettings = {
  id: DEFAULT_PROVIDER_ID,
  name: '默认供应商',
  apiBaseUrl: '',
  apiKey: '',
  requestMode: 'proxy',
  proxyUrl: '',
  proxyAccessToken: '',
  models: []
};

export const defaultSettings: AppSettings = {
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  stream: true,
  requestMode: 'proxy',
  proxyUrl: '',
  proxyAccessToken: '',
  providers: [defaultProvider],
  selectedProviderId: DEFAULT_PROVIDER_ID,
  selectedModel: '',
  darkMode: false,
  syncAccount: {
    endpoint: '',
    accountId: '',
    accessToken: '',
    autoSync: false
  }
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringSetting(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function numberSetting(value: unknown, fallback: number, isValid: (value: number) => boolean): number {
  return typeof value === 'number' && Number.isFinite(value) && isValid(value) ? value : fallback;
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function requestModeSetting(value: unknown, fallback: RequestMode = defaultSettings.requestMode): RequestMode {
  return typeof value === 'string' && requestModes.has(value) ? (value as RequestMode) : fallback;
}

function syncAccountSetting(value: unknown): SyncAccountSettings {
  if (!isRecord(value)) {
    return defaultSettings.syncAccount!;
  }

  return {
    endpoint: stringSetting(value.endpoint, defaultSettings.syncAccount!.endpoint),
    accountId: stringSetting(value.accountId, defaultSettings.syncAccount!.accountId),
    accessToken: stringSetting(value.accessToken, defaultSettings.syncAccount!.accessToken),
    autoSync: booleanSetting(value.autoSync, defaultSettings.syncAccount!.autoSync)
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function modelListSetting(value: unknown, selectedModel: string): string[] {
  const models = Array.isArray(value)
    ? value.filter((model): model is string => typeof model === 'string').map((model) => model.trim()).filter(Boolean)
    : [];
  const uniqueModels = [...new Set(models)];

  if (selectedModel.trim().length > 0 && !uniqueModels.includes(selectedModel)) {
    uniqueModels.push(selectedModel);
  }

  return uniqueModels;
}

function legacyProviderFrom(value: Record<string, unknown>): ProviderSettings {
  const selectedModel = nonEmptyString(value.selectedModel) ?? stringSetting(value.model, defaultSettings.model);

  return {
    id: DEFAULT_PROVIDER_ID,
    name: '默认供应商',
    apiBaseUrl: stringSetting(value.apiBaseUrl, defaultSettings.apiBaseUrl),
    apiKey: stringSetting(value.apiKey, defaultSettings.apiKey),
    requestMode: requestModeSetting(value.requestMode),
    proxyUrl: stringSetting(value.proxyUrl, defaultSettings.proxyUrl),
    proxyAccessToken: stringSetting(value.proxyAccessToken, defaultSettings.proxyAccessToken),
    models: modelListSetting(value.models, selectedModel)
  };
}

function sanitizeProvider(value: unknown, index: number): ProviderSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nonEmptyString(value.id) ?? `provider-${index + 1}`;
  const name = nonEmptyString(value.name) ?? `供应商 ${index + 1}`;
  const selectedModel = typeof value.selectedModel === 'string' ? value.selectedModel.trim() : '';

  return {
    id,
    name,
    apiBaseUrl: stringSetting(value.apiBaseUrl, defaultSettings.apiBaseUrl),
    apiKey: stringSetting(value.apiKey, defaultSettings.apiKey),
    requestMode: requestModeSetting(value.requestMode),
    proxyUrl: stringSetting(value.proxyUrl, defaultSettings.proxyUrl),
    proxyAccessToken: stringSetting(value.proxyAccessToken, defaultSettings.proxyAccessToken),
    models: modelListSetting(value.models, selectedModel)
  };
}

function providersSetting(value: unknown): ProviderSettings[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  const providers: ProviderSettings[] = [];

  for (const [index, providerValue] of value.entries()) {
    const provider = sanitizeProvider(providerValue, index);

    if (!provider || seenIds.has(provider.id)) {
      continue;
    }

    seenIds.add(provider.id);
    providers.push(provider);
  }

  return providers;
}

function hasLegacyConnectionValues(value: Record<string, unknown>): boolean {
  return [value.apiBaseUrl, value.apiKey, value.model, value.proxyUrl, value.proxyAccessToken].some(
    (field) => typeof field === 'string' && field.trim().length > 0
  );
}

function isBlankDefaultProvider(provider: ProviderSettings): boolean {
  return (
    provider.id === DEFAULT_PROVIDER_ID &&
    provider.apiBaseUrl.length === 0 &&
    provider.apiKey.length === 0 &&
    provider.proxyUrl.length === 0 &&
    provider.proxyAccessToken.length === 0 &&
    provider.models.length === 0
  );
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const legacyProvider = legacyProviderFrom(settings as unknown as Record<string, unknown>);
  const providers =
    !settings.providers ||
    settings.providers.length === 0 ||
    (settings.providers.length === 1 && isBlankDefaultProvider(settings.providers[0]) && hasLegacyConnectionValues(settings as unknown as Record<string, unknown>))
      ? [legacyProvider]
      : settings.providers;
  const activeProvider = providers.find((provider) => provider.id === settings.selectedProviderId) ?? providers[0] ?? defaultProvider;
  const selectedModel = settings.selectedModel || activeProvider.models[0] || settings.model;

  return {
    ...settings,
    apiBaseUrl: activeProvider.apiBaseUrl,
    apiKey: activeProvider.apiKey,
    model: selectedModel,
    requestMode: activeProvider.requestMode,
    proxyUrl: activeProvider.proxyUrl,
    proxyAccessToken: activeProvider.proxyAccessToken,
    providers,
    selectedProviderId: activeProvider.id,
    selectedModel,
    darkMode: booleanSetting(settings.darkMode, defaultSettings.darkMode ?? false)
  };
}

function sanitizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) {
    return defaultSettings;
  }

  const legacyProvider = legacyProviderFrom(value);
  const persistedProviders = providersSetting(value.providers);
  const shouldUseLegacyProvider =
    persistedProviders.length === 0 ||
    (persistedProviders.length === 1 && isBlankDefaultProvider(persistedProviders[0]) && hasLegacyConnectionValues(value));
  const providers = shouldUseLegacyProvider ? [legacyProvider] : persistedProviders;
  const selectedProviderId = stringSetting(value.selectedProviderId, providers[0]?.id ?? DEFAULT_PROVIDER_ID);
  const activeProvider = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? defaultProvider;
  const selectedModel = nonEmptyString(value.selectedModel) ?? stringSetting(value.model, activeProvider.models[0] ?? defaultSettings.model);

  return normalizeSettings({
    apiBaseUrl: activeProvider.apiBaseUrl,
    apiKey: activeProvider.apiKey,
    model: selectedModel,
    temperature: numberSetting(value.temperature, defaultSettings.temperature, (temperature) => temperature >= 0 && temperature <= 2),
    maxTokens: numberSetting(value.maxTokens, defaultSettings.maxTokens, (maxTokens) => maxTokens > 0),
    stream: booleanSetting(value.stream, defaultSettings.stream),
    requestMode: activeProvider.requestMode,
    proxyUrl: activeProvider.proxyUrl,
    proxyAccessToken: activeProvider.proxyAccessToken,
    providers,
    selectedProviderId: activeProvider.id,
    selectedModel,
    darkMode: booleanSetting(value.darkMode, defaultSettings.darkMode ?? false),
    syncAccount: syncAccountSetting(value.syncAccount)
  });
}

export function getActiveProviderSettings(settings: AppSettings): AppSettings {
  return normalizeSettings(settings);
}

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);

  if (!raw) {
    return defaultSettings;
  }

  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}
