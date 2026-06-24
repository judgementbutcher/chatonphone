import { useState } from 'react';
import type { AppSettings, ProviderSettings } from '../domain/types';
import { defaultSettings, getActiveProviderSettings, loadSettings, saveSettings as persistSettings } from '../settings/settingsStore';

export interface UseSettingsReturn {
  settings: AppSettings;
  activeProvider: ProviderSettings | undefined;
  quickModelOptions: string[];
  saveSettings: (nextSettings: AppSettings) => AppSettings;
  updateQuickModel: (model: string) => void;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState(() => loadSettings());

  const activeProvider = settings.providers?.find((provider) => provider.id === settings.selectedProviderId) ?? settings.providers?.[0];
  const quickModelOptions = activeProvider?.models ?? [];

  function saveSettingsSync(nextSettings: AppSettings): AppSettings {
    const normalizedSettings = getActiveProviderSettings(nextSettings);
    persistSettings(normalizedSettings);
    setSettings(normalizedSettings);
    return normalizedSettings;
  }

  function updateQuickModel(model: string) {
    if (!activeProvider) {
      return;
    }

    const nextProviders = (settings.providers ?? []).map((provider) => (
      provider.id === activeProvider.id ? {
        ...provider,
        models: provider.models.includes(model) ? provider.models : [...provider.models, model]
      } : provider
    ));

    saveSettingsSync({
      ...settings,
      providers: nextProviders,
      selectedProviderId: activeProvider.id,
      model,
      chatModel: model
    });
  }

  return {
    settings,
    activeProvider,
    quickModelOptions,
    saveSettings: saveSettingsSync,
    updateQuickModel
  };
}
