import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  DatabaseZap,
  KeyRound,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Search,
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

function modelGroupName(model: string): string {
  const [group] = model.split('/');

  return group && group !== model ? group : 'custom';
}

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
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');

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
  const filteredProviders = providers.filter((provider) => {
    const keyword = providerSearch.trim().toLowerCase();

    return !keyword || provider.name.toLowerCase().includes(keyword) || providerDefaultModel(provider).toLowerCase().includes(keyword);
  });
  const filteredModels = activeModelOptions.filter((model) => model.toLowerCase().includes(modelSearch.trim().toLowerCase()));
  const groupedModels = filteredModels.reduce<Array<{ group: string; models: string[] }>>((groups, model) => {
    const group = modelGroupName(model);
    const existingGroup = groups.find((currentGroup) => currentGroup.group === group);

    if (existingGroup) {
      existingGroup.models.push(model);
      return groups;
    }

    return [...groups, { group, models: [model] }];
  }, []);

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

  function handleRemoveModel(model: string) {
    const nextModels = activeModelOptions.filter((currentModel) => currentModel !== model);
    const nextDefaultModel = defaultModel === model ? nextModels[0] ?? '' : defaultModel;

    updateActiveProvider({ models: nextModels, defaultModel: nextDefaultModel });
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
          <div className={`mx-auto space-y-6 ${activeSection === 'provider' ? 'max-w-[980px]' : 'max-w-[760px]'}`}>
            {activeSection === 'provider' && (
              <Section
                id="settings-provider"
                title="模型服务"
                icon={<SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.2} />}
              >
                <div className="grid min-h-[520px] overflow-hidden rounded-xl border border-hairline/60 bg-card/[0.26] lg:grid-cols-[260px_minmax(0,1fr)]">
                  <aside className="soft-divider-right flex min-h-0 flex-col gap-3 p-3">
                    <Field label="供应商">
                      <select className={`${selectClass} lg:hidden`} value={activeProvider.id} onChange={(event) => handleProviderSelect(event.target.value)}>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>{provider.name}</option>
                        ))}
                      </select>
                    </Field>

                    <label className="tech-control hidden h-10 items-center gap-2 rounded-lg px-3 text-sm lg:flex">
                      <Search aria-hidden="true" size={15} strokeWidth={2.2} className="text-muted-foreground" />
                      <input
                        aria-label="搜索供应商"
                        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                        value={providerSearch}
                        placeholder="搜索供应商"
                        onChange={(event) => setProviderSearch(event.target.value)}
                      />
                    </label>

                    <div className="hidden min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 lg:block" aria-label="供应商列表">
                      {filteredProviders.map((provider) => {
                        const isActive = provider.id === activeProvider.id;
                        const isConfigured = Boolean(provider.apiBaseUrl.trim() && provider.apiKey.trim());

                        return (
                          <button
                            key={provider.id}
                            type="button"
                            aria-pressed={isActive}
                            className={`tech-control flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                              isActive ? 'bg-primary/10 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.72)]' : ''
                            }`}
                            onClick={() => handleProviderSelect(provider.id)}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                              {(provider.name || '?').trim().slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{provider.name || '未命名供应商'}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{providerDefaultModel(provider) || '未设置模型'}</span>
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isConfigured ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground'}`}>
                              {isConfigured ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        );
                      })}
                      {filteredProviders.length === 0 && (
                        <p className="px-3 py-4 text-center text-sm text-muted-foreground">没有匹配的供应商</p>
                      )}
                    </div>

                    <button type="button" className={`${secondaryButtonClass} w-full`} onClick={handleAddProvider}>
                      <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
                      新增供应商
                    </button>
                  </aside>

                  <fieldset className="min-w-0 space-y-5 p-4 sm:p-5">
                    <legend className="sr-only">供应商详情</legend>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <Field label="供应商名称">
                          <input className={inputClass} value={activeProvider.name} onChange={(event) => updateActiveProvider({ name: event.target.value })} />
                        </Field>
                      </div>
                      <div className="flex items-center gap-2 pt-0 sm:pt-7">
                        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/12 px-3 text-xs font-bold text-primary">
                          <Circle aria-hidden="true" size={8} fill="currentColor" />
                          ON
                        </span>
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
                    </div>

                    <div className="grid gap-4">
                      <Field label="API Key">
                        <div className="flex gap-2">
                          <input
                            className={inputClass}
                            value={activeProvider.apiKey}
                            type="password"
                            onChange={(event) => updateActiveProvider({ apiKey: event.target.value })}
                          />
                          <button type="button" className={`${secondaryButtonClass} shrink-0`} disabled={!onTestProvider || isTestingProvider} onClick={handleTestProvider}>
                            <Activity aria-hidden="true" size={16} strokeWidth={2.25} />
                            {isTestingProvider ? '测试中' : '测试连接'}
                          </button>
                        </div>
                      </Field>

                      <Field label="API Host">
                        <input
                          aria-label="API Base URL"
                          className={inputClass}
                          value={activeProvider.apiBaseUrl}
                          onChange={(event) => updateActiveProvider({ apiBaseUrl: event.target.value })}
                        />
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          Preview: {(activeProvider.apiBaseUrl || '').replace(/\/$/, '') || 'https://example.com/v1'}/chat/completions
                        </p>
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
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">模型列表</h4>
                          <p className="mt-1 text-xs text-muted-foreground">{activeModelOptions.length} 个模型</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <label className="tech-control flex h-10 min-w-[220px] items-center gap-2 rounded-lg px-3 text-sm">
                            <Search aria-hidden="true" size={15} strokeWidth={2.2} className="text-muted-foreground" />
                            <input
                              aria-label="搜索模型"
                              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                              value={modelSearch}
                              placeholder="搜索模型"
                              onChange={(event) => setModelSearch(event.target.value)}
                            />
                          </label>
                          <button type="button" className={secondaryButtonClass} disabled={!onFetchModels || isLoadingModels} onClick={handleFetchModels}>
                            <RefreshCw aria-hidden="true" size={16} strokeWidth={2.25} />
                            {isLoadingModels ? '拉取中' : '拉取模型'}
                          </button>
                        </div>
                      </div>

                      <div className="max-h-[280px] overflow-y-auto rounded-lg border border-hairline/60 bg-background/28">
                        {groupedModels.map((group) => (
                          <div key={group.group}>
                            <div className="soft-divider-bottom bg-card/[0.48] px-3 py-2 text-xs font-bold uppercase text-muted-foreground">
                              {group.group}
                            </div>
                            <div className="divide-y divide-hairline/45">
                              {group.models.map((model) => {
                                const isDefault = model === defaultModel;

                                return (
                                  <div key={model} className="flex min-w-0 items-center gap-2 px-3 py-2.5">
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                                      onClick={() => handleDefaultModelChange(model)}
                                    >
                                      {isDefault ? (
                                        <CheckCircle2 aria-hidden="true" size={16} strokeWidth={2.25} className="shrink-0 text-primary" />
                                      ) : (
                                        <Circle aria-hidden="true" size={16} strokeWidth={2.25} className="shrink-0 text-muted-foreground" />
                                      )}
                                      <span className="truncate">{model}</span>
                                      {isDefault && <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold text-primary">默认</span>}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`删除模型 ${model}`}
                                      className="soft-action inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                      onClick={() => handleRemoveModel(model)}
                                    >
                                      <Minus aria-hidden="true" size={15} strokeWidth={2.25} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {groupedModels.length === 0 && (
                          <p className="px-3 py-8 text-center text-sm text-muted-foreground">暂无模型，拉取模型或在默认模型中手动输入。</p>
                        )}
                      </div>
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
            )}

            {activeSection === 'persona' && (
              <section id="settings-persona">
                <PersonaManager personas={draft.personas ?? []} onChange={handlePersonasChange} />
              </section>
            )}

            {activeSection === 'generation' && (
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
            )}

            {activeSection === 'appearance' && (
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
            )}

            {activeSection === 'sync' && (
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
            )}

            {activeSection === 'data' && (
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
            )}
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
