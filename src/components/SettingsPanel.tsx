import { Activity, DatabaseZap, Moon, Plus, RefreshCw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
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

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10';
const selectClass = inputClass;
const secondaryButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-semibold shadow-sm transition hover:border-primary/45 hover:bg-primary/5 disabled:opacity-45';
const destructiveButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/8 px-3 text-sm font-semibold text-destructive shadow-sm transition hover:bg-destructive/12 disabled:opacity-45';

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
      className="flex h-full min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        const nextSettings = currentDraftSettings();

        acceptedSettingsRef.current = settings;
        setDraft(nextSettings);
        setIsDraftDirty(false);
        onSave(nextSettings);
      }}
    >
      <div className="border-b border-border px-5 pb-4 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Settings</p>
        <h2 className="mt-1 text-lg font-semibold tracking-normal">连接与模型</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
        <fieldset className="space-y-4">
          <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />
            供应商
          </legend>

          <Field label="供应商">
            <select className={selectClass} value={activeProvider.id} onChange={(event) => handleProviderSelect(event.target.value)}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondaryButtonClass} onClick={handleAddProvider}>
              <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
              新增供应商
            </button>
            <button type="button" className={destructiveButtonClass} disabled={providers.length <= 1} onClick={handleDeleteProvider}>
              <Trash2 aria-hidden="true" size={16} strokeWidth={2.25} />
              删除供应商
            </button>
          </div>

          <Field label="供应商名称">
            <input className={inputClass} value={activeProvider.name} onChange={(event) => updateActiveProvider({ name: event.target.value })} />
          </Field>

          <Field label="API Base URL">
            <input className={inputClass} value={activeProvider.apiBaseUrl} onChange={(event) => updateActiveProvider({ apiBaseUrl: event.target.value })} />
          </Field>

          <Field label="API Key">
            <input className={inputClass} value={activeProvider.apiKey} type="password" onChange={(event) => updateActiveProvider({ apiKey: event.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondaryButtonClass} disabled={!onFetchModels || isLoadingModels} onClick={handleFetchModels}>
              <RefreshCw aria-hidden="true" size={16} strokeWidth={2.25} />
              {isLoadingModels ? '拉取中' : '拉取模型列表'}
            </button>
            <button type="button" className={secondaryButtonClass} disabled={!onTestProvider || isTestingProvider} onClick={handleTestProvider}>
              <Activity aria-hidden="true" size={16} strokeWidth={2.25} />
              {isTestingProvider ? '测试中' : '测试供应商'}
            </button>
          </div>

          {(modelFetchStatus || providerTestStatus) && (
            <div className="space-y-2 rounded-md border border-border bg-muted/45 px-3 py-2 text-sm text-muted-foreground">
              {modelFetchStatus && <p role="status">{modelFetchStatus}</p>}
              {providerTestStatus && <p role="status">{providerTestStatus}</p>}
            </div>
          )}

          <Field label="模型列表">
            <select
              className={selectClass}
              value={activeModelOptions.includes(selectedModel) ? selectedModel : ''}
              disabled={activeModelOptions.length === 0}
              onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value, model: event.target.value })}
            >
              {activeModelOptions.length === 0 && <option value="">暂无模型列表</option>}
              {activeModelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </Field>

          <Field label="模型名">
            {activeModelOptions.length > 0 ? (
              <select
                className={selectClass}
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
                className={inputClass}
                value={selectedModel}
                onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value, model: event.target.value })}
              />
            )}
          </Field>
        </fieldset>

        <fieldset className="mt-7 space-y-4 border-t border-border pt-5">
          <legend className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Moon aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />
            外观
          </legend>
          <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-3">
            <span className="text-sm font-medium">暗色模式</span>
            <input
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={Boolean(draft.darkMode)}
              type="checkbox"
              onChange={(event) => updateDraft({ ...draft, darkMode: event.target.checked })}
            />
          </label>
        </fieldset>

        <fieldset className="mt-7 space-y-4 border-t border-border pt-5">
          <legend className="mb-3 text-sm font-semibold">生成</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Temperature">
              <input
                className={inputClass}
                value={draft.temperature}
                type="number"
                min="0"
                max="2"
                step="0.1"
                onChange={(event) => updateDraft({ ...draft, temperature: event.target.valueAsNumber })}
              />
            </Field>
            <Field label="Max tokens">
              <input
                className={inputClass}
                value={draft.maxTokens}
                type="number"
                min="1"
                step="1"
                onChange={(event) => updateDraft({ ...draft, maxTokens: event.target.valueAsNumber })}
              />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-md border border-border bg-background px-3 py-3">
            <span className="text-sm font-medium">Streaming enabled</span>
            <input
              className="h-4 w-4 accent-[hsl(var(--primary))]"
              checked={draft.stream}
              type="checkbox"
              onChange={(event) => updateDraft({ ...draft, stream: event.target.checked })}
            />
          </label>
        </fieldset>

        <fieldset className="mt-7 space-y-3 border-t border-border pt-5">
          <legend className="mb-3 text-sm font-semibold">账号同步</legend>
          <div className="rounded-md border border-border bg-background px-3 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">当前账号</span>
              <strong className="max-w-[180px] truncate text-sm font-semibold">{syncAccount.accountId || '未登录'}</strong>
            </div>
            {syncStatus && <p className="mt-2 text-sm text-muted-foreground" role="status">{syncStatus}</p>}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-2 border-t border-border bg-card px-5 py-4">
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
          <Save aria-hidden="true" size={17} strokeWidth={2.25} />
          保存设置
        </button>
        <button
          type="button"
          className={destructiveButtonClass}
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
