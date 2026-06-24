import { Activity, DatabaseZap, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppSettings, ProviderSettings } from '../domain/types';
import { defaultProvider, defaultSettings, getActiveProviderSettings } from '../settings/settingsStore';

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onResetLocalData: () => void;
  onFetchModels?: (settings: AppSettings) => Promise<string[]>;
  onTestProvider?: (settings: AppSettings) => Promise<void>;
  syncStatus?: string;
}

function providersFrom(settings: AppSettings): ProviderSettings[] {
  const providers = settings.providers && settings.providers.length > 0 ? settings.providers : [...(defaultSettings.providers ?? [])];

  return providers.length > 0 ? providers : [defaultProvider];
}

function nextProviderId(providers: ProviderSettings[]): string {
  let index = providers.length + 1;
  let id = `provider-${index}`;

  while (providers.some((provider) => provider.id === id)) {
    index += 1;
    id = `provider-${index}`;
  }

  return id;
}

function normalizeDraft(settings: AppSettings): AppSettings {
  return getActiveProviderSettings({
    ...settings,
    providers: providersFrom(settings)
  });
}

export default function SettingsPanel({
  settings,
  onSave,
  onResetLocalData,
  onFetchModels,
  onTestProvider,
  syncStatus
}: Props) {
  const [draft, setDraft] = useState(() => normalizeDraft(settings));
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const acceptedSettingsRef = useRef(settings);
  const [modelFetchStatus, setModelFetchStatus] = useState('');
  const [providerTestStatus, setProviderTestStatus] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);

  useEffect(() => {
    if (acceptedSettingsRef.current === settings) {
      return;
    }

    if (isDraftDirty) {
      return;
    }

    const nextDraft = normalizeDraft(settings);

    acceptedSettingsRef.current = settings;
    setDraft(nextDraft);
  }, [settings, isDraftDirty]);

  const providers = providersFrom(draft);
  const activeProvider = providers.find((provider) => provider.id === draft.selectedProviderId) ?? providers[0];
  const selectedModel = draft.selectedModel ?? draft.model;
  const activeModelOptions = activeProvider.models;
  const selectedModelIsListed = selectedModel ? activeModelOptions.includes(selectedModel) : true;
  const syncAccount = draft.syncAccount ?? defaultSettings.syncAccount!;

  function updateDraft(nextDraft: AppSettings) {
    setIsDraftDirty(true);
    setDraft(nextDraft);
  }

  function setNormalizedDraft(nextDraft: AppSettings) {
    updateDraft(normalizeDraft(nextDraft));
  }

  function updateActiveProvider(patch: Partial<ProviderSettings>, selectedModelOverride = selectedModel) {
    const nextProviders = providers.map((provider) => (
      provider.id === activeProvider.id ? { ...provider, ...patch } : provider
    ));

    setNormalizedDraft({
      ...draft,
      providers: nextProviders,
      selectedModel: selectedModelOverride
    });
  }

  function handleProviderSelect(providerId: string) {
    const provider = providers.find((currentProvider) => currentProvider.id === providerId) ?? providers[0];

    setNormalizedDraft({
      ...draft,
      selectedProviderId: provider.id,
      selectedModel: provider.models[0] ?? ''
    });
  }

  function handleAddProvider() {
    const provider: ProviderSettings = {
      id: nextProviderId(providers),
      name: `供应商 ${providers.length + 1}`,
      apiBaseUrl: '',
      apiKey: '',
      requestMode: 'proxy',
      proxyUrl: '',
      proxyAccessToken: '',
      models: []
    };

    setNormalizedDraft({
      ...draft,
      providers: [...providers, provider],
      selectedProviderId: provider.id,
      selectedModel: ''
    });
  }

  function handleDeleteProvider() {
    if (providers.length <= 1) {
      return;
    }

    const nextProviders = providers.filter((provider) => provider.id !== activeProvider.id);
    const nextActiveProvider = nextProviders[0];

    setNormalizedDraft({
      ...draft,
      providers: nextProviders,
      selectedProviderId: nextActiveProvider.id,
      selectedModel: nextActiveProvider.models[0] ?? ''
    });
  }

  function currentDraftSettings() {
    const selectedModelValue = selectedModel.trim();
    const nextProviders = providers.map((provider) => {
      const nextModels =
        provider.id === activeProvider.id && selectedModelValue && !provider.models.includes(selectedModelValue)
          ? [...provider.models, selectedModelValue]
          : provider.models;

      return {
        ...provider,
        models: nextModels,
        requestMode: 'proxy' as const,
        proxyUrl: '',
        proxyAccessToken: ''
      };
    });

    return getActiveProviderSettings({
      ...draft,
      providers: nextProviders,
      selectedModel: selectedModelValue,
      model: selectedModelValue,
      syncAccount: {
        ...syncAccount,
        autoSync: true
      }
    });
  }

  async function handleFetchModels() {
    if (!onFetchModels || isLoadingModels) {
      return;
    }

    setIsLoadingModels(true);
    setModelFetchStatus('');

    try {
      const models = await onFetchModels(currentDraftSettings());
      const nextSelectedModel = models.includes(selectedModel) ? selectedModel : models[0] ?? '';

      updateActiveProvider({ models, requestMode: 'proxy', proxyUrl: '', proxyAccessToken: '' }, nextSelectedModel);
      setModelFetchStatus(models.length > 0 ? `已拉取 ${models.length} 个模型` : '接口未返回模型。');
    } catch {
      setModelFetchStatus('模型列表拉取失败，请检查 Base URL 和 Key。');
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function handleTestProvider() {
    if (!onTestProvider || isTestingProvider) {
      return;
    }

    if (!selectedModel.trim()) {
      setProviderTestStatus('请先填写模型名。');
      return;
    }

    setIsTestingProvider(true);
    setProviderTestStatus('');

    try {
      await onTestProvider(currentDraftSettings());
      setProviderTestStatus('测试通过，供应商可用。');
    } catch {
      setProviderTestStatus('测试失败，请检查 Base URL、Key 和模型名。');
    } finally {
      setIsTestingProvider(false);
    }
  }

  return (
    <form
      className="settingsPanel"
      onSubmit={(event) => {
        event.preventDefault();
        const nextSettings = currentDraftSettings();

        acceptedSettingsRef.current = settings;
        setDraft(nextSettings);
        setIsDraftDirty(false);
        onSave(nextSettings);
      }}
    >
      <div className="panelHeader settingsHeader">
        <div>
          <span className="eyebrow">设置</span>
          <h2>连接与模型</h2>
        </div>
      </div>
      <fieldset className="settingsGroup">
        <legend>供应商</legend>
        <label>
          供应商
          <select value={activeProvider.id} onChange={(event) => handleProviderSelect(event.target.value)}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
        </label>
        <div className="providerActions">
          <button type="button" className="secondaryButton" onClick={handleAddProvider}>
            <Plus aria-hidden="true" size={17} strokeWidth={2.25} />
            新增供应商
          </button>
          <button type="button" className="destructiveButton subtleButton" disabled={providers.length <= 1} onClick={handleDeleteProvider}>
            <Trash2 aria-hidden="true" size={17} strokeWidth={2.25} />
            删除供应商
          </button>
        </div>
        <label>
          供应商名称
          <input value={activeProvider.name} onChange={(event) => updateActiveProvider({ name: event.target.value })} />
        </label>
        <label>
          API Base URL
          <input value={activeProvider.apiBaseUrl} onChange={(event) => updateActiveProvider({ apiBaseUrl: event.target.value })} />
        </label>
        <label>
          API Key
          <input value={activeProvider.apiKey} type="password" onChange={(event) => updateActiveProvider({ apiKey: event.target.value })} />
        </label>
        <div className="providerActions">
          <button type="button" className="secondaryButton" disabled={!onFetchModels || isLoadingModels} onClick={handleFetchModels}>
            <RefreshCw aria-hidden="true" size={17} strokeWidth={2.25} />
            {isLoadingModels ? '拉取中' : '拉取模型列表'}
          </button>
          <button type="button" className="secondaryButton" disabled={!onTestProvider || isTestingProvider} onClick={handleTestProvider}>
            <Activity aria-hidden="true" size={17} strokeWidth={2.25} />
            {isTestingProvider ? '测试中' : '测试供应商'}
          </button>
          {modelFetchStatus && <p className="syncStatus" role="status">{modelFetchStatus}</p>}
          {providerTestStatus && <p className="syncStatus" role="status">{providerTestStatus}</p>}
        </div>
        <label>
          模型列表
          <select
            value={activeModelOptions.includes(selectedModel) ? selectedModel : ''}
            disabled={activeModelOptions.length === 0}
            onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value, model: event.target.value })}
          >
            {activeModelOptions.length === 0 && <option value="">暂无模型列表</option>}
            {activeModelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
        <label>
          模型名
          {activeModelOptions.length > 0 ? (
            <select
              value={selectedModel}
              onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value, model: event.target.value })}
            >
              {!selectedModelIsListed && <option value={selectedModel}>{selectedModel}</option>}
              {activeModelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          ) : (
            <input
              value={selectedModel}
              onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value, model: event.target.value })}
            />
          )}
        </label>
      </fieldset>
      <fieldset className="settingsGroup">
        <legend>外观</legend>
        <label className="toggleField">
          <span>暗色模式</span>
          <input
            checked={Boolean(draft.darkMode)}
            type="checkbox"
            onChange={(event) => updateDraft({ ...draft, darkMode: event.target.checked })}
          />
        </label>
      </fieldset>
      <fieldset className="settingsGroup">
        <legend>生成</legend>
        <div className="splitFields">
          <label>
            Temperature
            <input
              value={draft.temperature}
              type="number"
              min="0"
              max="2"
              step="0.1"
              onChange={(event) => updateDraft({ ...draft, temperature: event.target.valueAsNumber })}
            />
          </label>
          <label>
            Max tokens
            <input
              value={draft.maxTokens}
              type="number"
              min="1"
              step="1"
              onChange={(event) => updateDraft({ ...draft, maxTokens: event.target.valueAsNumber })}
            />
          </label>
        </div>
        <label className="toggleField">
          <span>Streaming enabled</span>
          <input
            checked={draft.stream}
            type="checkbox"
            onChange={(event) => updateDraft({ ...draft, stream: event.target.checked })}
          />
        </label>
      </fieldset>
      <fieldset className="settingsGroup">
        <legend>账号同步</legend>
        <div className="accountSummary">
          <span>当前账号</span>
          <strong>{syncAccount.accountId || '未登录'}</strong>
        </div>
        {syncStatus && <p className="syncStatus" role="status">{syncStatus}</p>}
      </fieldset>
      <div className="settingsActions">
        <button type="submit" className="primaryButton">
          <Save aria-hidden="true" size={17} strokeWidth={2.25} />
          保存设置
        </button>
        <button
          type="button"
          className="destructiveButton"
          onClick={() => {
            acceptedSettingsRef.current = settings;
            setIsDraftDirty(false);
            setDraft(normalizeDraft(settings));
            onResetLocalData();
          }}
        >
          <DatabaseZap aria-hidden="true" size={17} strokeWidth={2.25} />
          清除本机数据
        </button>
      </div>
    </form>
  );
}
