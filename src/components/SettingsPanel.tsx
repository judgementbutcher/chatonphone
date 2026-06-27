import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity,
  AlertTriangle,
  DatabaseZap,
  KeyRound,
  Moon,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  UserCog,
  WandSparkles
} from 'lucide-react';
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
  onCancel?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  syncStatus?: string;
}

type SettingsSection = 'provider' | 'persona' | 'generation' | 'appearance' | 'sync' | 'data';
type ConfirmationKind = 'delete-provider' | 'reset-data' | 'discard' | null;

const sections: Array<{ id: SettingsSection; label: string; icon: React.ReactNode }> = [
  { id: 'provider', label: '模型服务', icon: <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.2} /> },
  { id: 'persona', label: '角色预设', icon: <UserCog aria-hidden="true" size={16} strokeWidth={2.2} /> },
  { id: 'generation', label: '生成参数', icon: <WandSparkles aria-hidden="true" size={16} strokeWidth={2.2} /> },
  { id: 'appearance', label: '外观', icon: <Moon aria-hidden="true" size={16} strokeWidth={2.2} /> },
  { id: 'sync', label: '同步账号', icon: <KeyRound aria-hidden="true" size={16} strokeWidth={2.2} /> },
  { id: 'data', label: '数据与危险区', icon: <DatabaseZap aria-hidden="true" size={16} strokeWidth={2.2} /> }
];

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

function providerDefaultModel(provider: ProviderSettings, fallback = ''): string {
  return provider.defaultModel?.trim() || fallback.trim() || provider.models[0] || '';
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
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </section>
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

function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onOpenChange
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[230] bg-foreground/35 backdrop-blur-sm" />
        <Dialog.Content
          role="alertdialog"
          className="animate-pop-in glass-panel-strong fixed left-1/2 top-1/2 z-[240] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl p-5"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => onOpenChange(false)}>
              取消
            </button>
            <button
              type="button"
              className={destructiveButtonClass}
              onClick={() => {
                onOpenChange(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputClass = 'tech-control h-10 w-full rounded-lg px-3.5 text-sm outline-none';
const selectClass = inputClass;
const secondaryButtonClass = 'soft-action inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-45';
const destructiveButtonClass = 'danger-action inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold disabled:opacity-45';

export default function SettingsPanel({
  settings,
  onSave,
  onResetLocalData,
  onFetchModels,
  onTestProvider,
  onCancel,
  onDirtyChange,
  syncStatus
}: Props) {
  const [draft, setDraft] = useState(() => normalizeDraft(settings));
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('provider');
  const [confirmation, setConfirmation] = useState<ConfirmationKind>(null);
  const acceptedSettingsRef = useRef(settings);
  const [modelFetchStatus, setModelFetchStatus] = useState('');
  const [providerTestStatus, setProviderTestStatus] = useState('');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);

  useEffect(() => {
    onDirtyChange?.(isDraftDirty);
  }, [isDraftDirty, onDirtyChange]);

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
  const defaultModel = providerDefaultModel(activeProvider, draft.selectedModel ?? draft.model);
  const activeModelOptions = activeProvider.models;
  const defaultModelIsListed = defaultModel ? activeModelOptions.includes(defaultModel) : true;
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

  function updateActiveProvider(patch: Partial<ProviderSettings>) {
    const nextProviders = providers.map((provider) => (
      provider.id === activeProvider.id ? { ...provider, ...patch } : provider
    ));
    const nextActiveProvider = nextProviders.find((provider) => provider.id === activeProvider.id) ?? activeProvider;
    const nextDefaultModel = typeof patch.defaultModel === 'string' ? patch.defaultModel : defaultModel;

    updateDraft({
      ...draft,
      providers: nextProviders,
      selectedProviderId: nextActiveProvider.id,
      selectedModel: nextDefaultModel,
      apiBaseUrl: nextActiveProvider.apiBaseUrl,
      apiKey: nextActiveProvider.apiKey,
      requestMode: nextActiveProvider.requestMode,
      proxyUrl: nextActiveProvider.proxyUrl,
      proxyAccessToken: nextActiveProvider.proxyAccessToken
    });
  }

  function handleDefaultModelChange(model: string) {
    updateActiveProvider({ defaultModel: model });
  }

  function handleProviderSelect(providerId: string) {
    const provider = providers.find((currentProvider) => currentProvider.id === providerId) ?? providers[0];
    const nextDefaultModel = providerDefaultModel(provider);

    setNormalizedDraft({
      ...draft,
      selectedProviderId: provider.id,
      selectedModel: nextDefaultModel,
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
      models: [],
      defaultModel: ''
    };

    setNormalizedDraft({
      ...draft,
      providers: [...providers, provider],
      selectedProviderId: provider.id,
      selectedModel: ''
    });
  }

  function confirmDeleteProvider() {
    if (providers.length <= 1) {
      return;
    }

    const nextProviders = providers.filter((provider) => provider.id !== activeProvider.id);
    const nextActiveProvider = nextProviders[0];
    const nextDefaultModel = providerDefaultModel(nextActiveProvider);

    setNormalizedDraft({
      ...draft,
      providers: nextProviders,
      selectedProviderId: nextActiveProvider.id,
      selectedModel: nextDefaultModel
    });
  }

  function currentDraftSettings() {
    const defaultModelValue = defaultModel.trim();
    const nextProviders = providers.map((provider) => {
      const isActive = provider.id === activeProvider.id;
      const nextModels =
        isActive && defaultModelValue && !provider.models.includes(defaultModelValue)
          ? [...provider.models, defaultModelValue]
          : provider.models;

      return {
        ...provider,
        models: nextModels,
        defaultModel: isActive ? defaultModelValue : providerDefaultModel(provider),
        requestMode: 'proxy' as const,
        proxyUrl: '',
        proxyAccessToken: ''
      };
    });

    return getActiveProviderSettings({
      ...draft,
      model: defaultModelValue,
      chatModel: defaultModelValue,
      providers: nextProviders,
      selectedModel: defaultModelValue,
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
      const nextDefaultModel = models.includes(defaultModel) ? defaultModel : models[0] ?? '';

      updateActiveProvider({ models, defaultModel: nextDefaultModel, requestMode: 'proxy', proxyUrl: '', proxyAccessToken: '' });
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

    if (!defaultModel.trim()) {
      setProviderTestStatus('请先填写默认聊天模型。');
      return;
    }

    setIsTestingProvider(true);
    setProviderTestStatus('');

    try {
      await onTestProvider(currentDraftSettings());
      setProviderTestStatus('测试通过，供应商可用。');
    } catch {
      setProviderTestStatus('测试失败，请检查 Base URL、Key 和默认聊天模型。');
    } finally {
      setIsTestingProvider(false);
    }
  }

  function handleCancel() {
    if (isDraftDirty) {
      setConfirmation('discard');
      return;
    }

    onCancel?.();
  }

  function discardDraftAndClose() {
    acceptedSettingsRef.current = settings;
    setIsDraftDirty(false);
    setDraft(normalizeDraft(settings));
    onCancel?.();
  }

  function handleSectionChange(section: SettingsSection) {
    setActiveSection(section);
    document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
      <div className="soft-divider-bottom px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">设置中心</p>
            <h2 className="mt-1 text-xl font-semibold">ChatOnPhone 配置</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-[360px]">
            <div className="tech-control min-w-0 rounded-lg px-3 py-2">
              <p className="text-[11px] text-muted-foreground">当前供应商</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{activeProvider.name || '未配置'}</p>
            </div>
            <div className="tech-control min-w-0 rounded-lg px-3 py-2">
              <p className="text-[11px] text-muted-foreground">默认聊天模型</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{defaultModel || '未设置'}</p>
            </div>
          </div>
        </div>

        <label className="mt-4 block space-y-2 lg:hidden">
          <span className="text-sm font-medium">设置分类</span>
          <select
            aria-label="设置分类"
            className={selectClass}
            value={activeSection}
            onChange={(event) => handleSectionChange(event.target.value as SettingsSection)}
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[208px_minmax(0,1fr)]">
        <nav className="soft-divider-right hidden min-h-0 overflow-y-auto px-3 py-4 lg:block" aria-label="设置分类">
          <div className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold transition ${
                  activeSection === section.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'
                }`}
                onClick={() => handleSectionChange(section.id)}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 scrollbar-thin">
          <div className="mx-auto max-w-[760px] space-y-8">
            <Section
              id="settings-provider"
              title="模型服务"
              icon={<SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.2} />}
            >
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <Field label="供应商">
                    <select className={`${selectClass} lg:hidden`} value={activeProvider.id} onChange={(event) => handleProviderSelect(event.target.value)}>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="hidden space-y-2 lg:block" aria-label="供应商列表">
                    {providers.map((provider) => (
                      <button
                        key={provider.id}
                        type="button"
                        className={`tech-control flex w-full min-w-0 flex-col rounded-lg px-3 py-2 text-left ${
                          provider.id === activeProvider.id ? 'shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.72)]' : ''
                        }`}
                        onClick={() => handleProviderSelect(provider.id)}
                      >
                        <span className="truncate text-sm font-semibold">{provider.name}</span>
                        <span className="mt-0.5 truncate text-xs text-muted-foreground">{providerDefaultModel(provider) || '未设置模型'}</span>
                      </button>
                    ))}
                  </div>

                  <button type="button" className={`${secondaryButtonClass} w-full`} onClick={handleAddProvider}>
                    <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
                    新增供应商
                  </button>
                </div>

                <fieldset className="space-y-4">
                  <legend className="sr-only">供应商详情</legend>
                  <Field label="供应商名称">
                    <input className={inputClass} value={activeProvider.name} onChange={(event) => updateActiveProvider({ name: event.target.value })} />
                  </Field>

                  <Field label="API Base URL">
                    <input className={inputClass} value={activeProvider.apiBaseUrl} onChange={(event) => updateActiveProvider({ apiBaseUrl: event.target.value })} />
                  </Field>

                  <Field label="API Key">
                    <input className={inputClass} value={activeProvider.apiKey} type="password" onChange={(event) => updateActiveProvider({ apiKey: event.target.value })} />
                  </Field>

                  <Field label="模型列表">
                    <textarea
                      className="tech-control min-h-24 w-full resize-y rounded-lg px-3.5 py-3 text-sm outline-none"
                      value={activeProvider.models.join('\n')}
                      placeholder="每行一个模型 ID"
                      onChange={(event) => {
                        const models = event.target.value.split('\n').map((model) => model.trim()).filter(Boolean);
                        updateActiveProvider({ models });
                      }}
                    />
                  </Field>

                  <Field label="默认聊天模型">
                    {activeModelOptions.length > 0 ? (
                      <select
                        aria-label="默认聊天模型"
                        className={selectClass}
                        value={activeModelOptions.includes(defaultModel) ? defaultModel : ''}
                        onChange={(event) => handleDefaultModelChange(event.target.value)}
                      >
                        {!defaultModelIsListed && <option value={defaultModel}>{defaultModel}</option>}
                        {activeModelOptions.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label="默认聊天模型"
                        className={inputClass}
                        value={defaultModel}
                        placeholder="输入默认聊天模型"
                        onChange={(event) => handleDefaultModelChange(event.target.value)}
                      />
                    )}
                  </Field>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" className={secondaryButtonClass} disabled={!onFetchModels || isLoadingModels} onClick={handleFetchModels}>
                      <RefreshCw aria-hidden="true" size={16} strokeWidth={2.25} />
                      {isLoadingModels ? '拉取中' : '拉取模型'}
                    </button>
                    <button type="button" className={secondaryButtonClass} disabled={!onTestProvider || isTestingProvider} onClick={handleTestProvider}>
                      <Activity aria-hidden="true" size={16} strokeWidth={2.25} />
                      {isTestingProvider ? '测试中' : '测试连接'}
                    </button>
                    <button
                      type="button"
                      className={destructiveButtonClass}
                      disabled={providers.length <= 1}
                      onClick={() => setConfirmation('delete-provider')}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={2.25} />
                      删除供应商
                    </button>
                  </div>

                  {(modelFetchStatus || providerTestStatus) && (
                    <div className="chip space-y-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                      {modelFetchStatus && <p role="status">{modelFetchStatus}</p>}
                      {providerTestStatus && <p role="status">{providerTestStatus}</p>}
                    </div>
                  )}
                </fieldset>
              </div>
            </Section>

            <section id="settings-persona" className="scroll-mt-6">
              <PersonaManager personas={draft.personas ?? []} onChange={handlePersonasChange} />
            </section>

            <Section
              id="settings-generation"
              title="生成参数"
              icon={<WandSparkles aria-hidden="true" size={16} strokeWidth={2.2} />}
            >
              <fieldset className="space-y-4">
                <legend className="sr-only">生成参数</legend>
                <div className="grid gap-3 sm:grid-cols-2">
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
              icon={<Moon aria-hidden="true" size={16} strokeWidth={2.2} />}
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
              title="同步账号"
              icon={<KeyRound aria-hidden="true" size={16} strokeWidth={2.2} />}
            >
              <div className="tech-control rounded-lg px-3 py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">当前账号</span>
                  <strong className="max-w-[240px] truncate text-sm font-semibold">{syncAccount.accountId || '未登录'}</strong>
                </div>
                {syncStatus && <p className="mt-2 text-sm text-muted-foreground" role="status">{syncStatus}</p>}
              </div>
            </Section>

            <Section
              id="settings-data"
              title="数据与危险区"
              icon={<DatabaseZap aria-hidden="true" size={16} strokeWidth={2.2} />}
            >
              <div className="tech-control rounded-lg px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">清除本机数据</p>
                    <p className="mt-1 text-sm text-muted-foreground">移除本机设置、会话和缓存；已登录账号信息会保留用于继续同步。</p>
                  </div>
                  <button type="button" className={destructiveButtonClass} onClick={() => setConfirmation('reset-data')}>
                    <DatabaseZap aria-hidden="true" size={17} strokeWidth={2.25} />
                    清除本机数据
                  </button>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>

      <div className="soft-divider-top grid gap-2 bg-card/[0.5] px-4 py-3 backdrop-blur-xl sm:flex sm:justify-end sm:px-6">
        <button type="button" className={secondaryButtonClass} onClick={handleCancel}>
          取消
        </button>
        <button type="submit" className="primary-action inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold">
          <Save aria-hidden="true" size={17} strokeWidth={2.25} />
          保存设置
        </button>
      </div>

      <ConfirmationDialog
        open={confirmation === 'delete-provider'}
        title="删除供应商？"
        description={`将删除“${activeProvider.name || '未命名供应商'}”及其模型列表。此操作只会在当前草稿中生效，保存设置后写入本机。`}
        confirmLabel="删除供应商"
        onConfirm={confirmDeleteProvider}
        onOpenChange={(open) => setConfirmation(open ? 'delete-provider' : null)}
      />
      <ConfirmationDialog
        open={confirmation === 'reset-data'}
        title="清除本机数据？"
        description="此操作会清除本机设置、会话和缓存，无法撤销。"
        confirmLabel="清除本机数据"
        onConfirm={() => {
          acceptedSettingsRef.current = settings;
          setIsDraftDirty(false);
          setDraft(normalizeDraft(settings));
          onResetLocalData();
        }}
        onOpenChange={(open) => setConfirmation(open ? 'reset-data' : null)}
      />
      <ConfirmationDialog
        open={confirmation === 'discard'}
        title="放弃未保存更改？"
        description="当前设置草稿还没有保存，关闭后这些更改会丢失。"
        confirmLabel="放弃更改"
        onConfirm={discardDraftAndClose}
        onOpenChange={(open) => setConfirmation(open ? 'discard' : null)}
      />
    </form>
  );
}
