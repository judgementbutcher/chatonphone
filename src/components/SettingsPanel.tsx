import { Activity, DatabaseZap, KeyRound, Moon, Plus, RefreshCw, Save, SlidersHorizontal, Trash2, UserCog, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppSettings, Persona, ProviderSettings } from '../domain/types';
import { defaultProvider, defaultSettings, getActiveProviderSettings } from '../settings/settingsStore';
import PersonaManager from './PersonaManager';

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

function Section({
  id,
  title,
  icon,
  children
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 space-y-4 soft-divider-top pt-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function NavLink({
  href,
  icon,
  children
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a href={href} className="chip inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition hover:text-primary">
      {icon}
      {children}
    </a>
  );
}

function ToggleRow({
  label,
  ariaLabel,
  checked,
  onChange
}: {
  label: string;
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="tech-control flex items-center justify-between gap-4 rounded-lg px-3 py-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          aria-label={ariaLabel ?? label}
          className="peer sr-only"
          checked={checked}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-muted shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.7)] transition peer-checked:bg-primary" />
        <span className="absolute left-1 h-4 w-4 rounded-full bg-background shadow transition peer-checked:translate-x-5 peer-checked:bg-primary-foreground" />
      </span>
    </label>
  );
}

const inputClass = 'tech-control h-10 w-full rounded-full px-3.5 text-sm outline-none';
const selectClass = inputClass;
const secondaryButtonClass = 'soft-action inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold disabled:opacity-45';
const destructiveButtonClass = 'danger-action inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold disabled:opacity-45';

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

  function handlePersonasChange(personas: Persona[]) {
    updateDraft({ ...draft, personas });
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
      selectedModel: provider.models[0] ?? '',
      // 保留用户设置的参数，不因切换供应商而改变
      temperature: draft.temperature,
      maxTokens: draft.maxTokens,
      stream: draft.stream
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
    const existingChatModel = draft.chatModel?.trim() || draft.model.trim();
    const chatModelValue = existingChatModel || selectedModelValue;
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

    // 保存时只更新 selectedModel，不修改 model（对话界面的模型选择独立）
    return getActiveProviderSettings({
      ...draft,
      model: chatModelValue || selectedModelValue,
      chatModel: chatModelValue,
      providers: nextProviders,
      selectedModel: selectedModelValue,
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
      <div className="soft-divider-bottom space-y-3 px-5 pb-4 pr-14 pt-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">设置</p>
          <h2 className="mt-1 text-lg font-semibold">工作台配置</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="tech-control rounded-lg px-3 py-2">
            <p className="text-[11px] text-muted-foreground">当前供应商</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{activeProvider.name || '未配置'}</p>
          </div>
          <div className="tech-control rounded-lg px-3 py-2">
            <p className="text-[11px] text-muted-foreground">聊天模型</p>
            <p className="mt-0.5 truncate text-sm font-semibold">{draft.chatModel || draft.model || selectedModel || '未设置'}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
        <nav className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="设置分区">
          <NavLink href="#settings-provider" icon={<SlidersHorizontal aria-hidden="true" size={14} strokeWidth={2.2} />}>模型服务</NavLink>
          <NavLink href="#settings-persona" icon={<UserCog aria-hidden="true" size={14} strokeWidth={2.2} />}>角色</NavLink>
          <NavLink href="#settings-generation" icon={<WandSparkles aria-hidden="true" size={14} strokeWidth={2.2} />}>生成</NavLink>
          <NavLink href="#settings-appearance" icon={<Moon aria-hidden="true" size={14} strokeWidth={2.2} />}>外观</NavLink>
          <NavLink href="#settings-sync" icon={<KeyRound aria-hidden="true" size={14} strokeWidth={2.2} />}>同步</NavLink>
        </nav>

        <div className="space-y-7">
          <Section
            id="settings-provider"
            title="模型服务"
            icon={<SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />}
          >
            <fieldset className="space-y-4">
              <legend className="sr-only">供应商</legend>

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
                <div className="chip space-y-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  {modelFetchStatus && <p role="status">{modelFetchStatus}</p>}
                  {providerTestStatus && <p role="status">{providerTestStatus}</p>}
                </div>
              )}

              <Field label="模型列表（仅测试用）">
                <select
                  aria-label="模型列表"
                  className={selectClass}
                  value={activeModelOptions.includes(selectedModel) ? selectedModel : ''}
                  disabled={activeModelOptions.length === 0}
                  onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value })}
                >
                  {activeModelOptions.length === 0 && <option value="">暂无模型列表</option>}
                  {activeModelOptions.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </Field>

              <Field label="模型名（仅测试用）">
                {activeModelOptions.length > 0 ? (
                  <select
                    aria-label="模型名"
                    className={selectClass}
                    value={selectedModel}
                    onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value })}
                  >
                    {!selectedModelIsListed && <option value={selectedModel}>{selectedModel}</option>}
                    {activeModelOptions.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="模型名"
                    className={inputClass}
                    value={selectedModel}
                    placeholder="输入测试用模型名"
                    onChange={(event) => updateDraft({ ...draft, selectedModel: event.target.value })}
                  />
                )}
              </Field>
            </fieldset>
          </Section>

          <section id="settings-persona" className="scroll-mt-4">
            <PersonaManager personas={draft.personas ?? []} onChange={handlePersonasChange} />
          </section>

          <Section
            id="settings-generation"
            title="生成"
            icon={<WandSparkles aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />}
          >
            <fieldset className="space-y-4">
              <legend className="sr-only">生成</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperature">
                  <input
                    className={inputClass}
                    value={Number.isFinite(draft.temperature) ? draft.temperature : ''}
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
                    value={Number.isFinite(draft.maxTokens) ? draft.maxTokens : ''}
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    onChange={(event) => updateDraft({ ...draft, maxTokens: event.target.valueAsNumber })}
                  />
                </Field>
              </div>
              <ToggleRow
                label="Streaming enabled"
                checked={draft.stream}
                onChange={(checked) => updateDraft({ ...draft, stream: checked })}
              />
            </fieldset>
          </Section>

          <Section
            id="settings-appearance"
            title="外观"
            icon={<Moon aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />}
          >
            <fieldset className="space-y-4">
              <legend className="sr-only">外观</legend>
              <ToggleRow
                label="暗色模式"
                checked={Boolean(draft.darkMode)}
                onChange={(checked) => updateDraft({ ...draft, darkMode: checked })}
              />
            </fieldset>
          </Section>

          <Section
            id="settings-sync"
            title="账号同步"
            icon={<KeyRound aria-hidden="true" size={16} strokeWidth={2.2} className="text-primary" />}
          >
            <div className="tech-control rounded-lg px-3 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">当前账号</span>
                <strong className="max-w-[180px] truncate text-sm font-semibold">{syncAccount.accountId || '未登录'}</strong>
              </div>
              {syncStatus && <p className="mt-2 text-sm text-muted-foreground" role="status">{syncStatus}</p>}
            </div>
          </Section>
        </div>
      </div>

      <div className="soft-divider-top grid gap-2 bg-card/[0.35] px-5 py-4 backdrop-blur-xl">
        <button type="submit" className="primary-action inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold">
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
