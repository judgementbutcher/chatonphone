import { useEffect, useMemo, useState } from 'react';
import { Menu, PanelRightOpen, Settings as SettingsIcon, Sparkles, X } from 'lucide-react';
import type { AppSettings } from '../domain/types';
import { useDrawers } from '../hooks/useDrawers';
import { useConversations } from '../hooks/useConversations';
import { useChatGeneration } from '../hooks/useChatGeneration';
import { useSyncManager, useAutoSync, providerSyncSignature } from '../hooks/useSyncManager';
import { resetLocalData } from '../storage/conversationRepo';
import { defaultSettings } from '../settings/settingsStore';
import { fetchModelList } from '../transport/chatClient';
import Composer from '../components/Composer';
import ConversationList from '../components/ConversationList';
import ErrorBanner from '../components/ErrorBanner';
import MessageList from '../components/MessageList';
import SettingsPanel from '../components/SettingsPanel';

interface ChatPageProps {
  settings: AppSettings;
  themeName: string;
  onSettingsChange: (settings: AppSettings) => void;
}

export default function ChatPage({ settings, themeName, onSettingsChange }: ChatPageProps) {
  const [draftText, setDraftText] = useState('');
  const [isResettingLocalData, setIsResettingLocalData] = useState(false);
  const drawers = useDrawers();
  const sync = useSyncManager();

  const conversations = useConversations(settings, (message) => {
    chatGeneration.dispatch({ type: 'set-error', message });
  });

  const chatGeneration = useChatGeneration(
    settings,
    conversations.activeConversation,
    conversations.persistenceVersion,
    conversations.deletedConversationIds
  );

  const quickModelOptions = settings.providers?.find((p) => p.id === settings.selectedProviderId)?.models ?? [];
  const activeProvider = useMemo(
    () => settings.providers?.find((provider) => provider.id === settings.selectedProviderId) ?? settings.providers?.[0],
    [settings.providers, settings.selectedProviderId]
  );

  useAutoSync(settings, sync.pullSyncedSettings, onSettingsChange);

  useEffect(() => {
    conversations.saveConversationWithMessages(chatGeneration.state.messages);
  }, [chatGeneration.state.messages]);

  async function handleSaveSettings(nextSettings: AppSettings) {
    const previousProviderSignature = providerSyncSignature(settings);
    onSettingsChange(nextSettings);
    drawers.closeDrawers();

    if (
      nextSettings.syncAccount?.accessToken.trim() &&
      providerSyncSignature(nextSettings) !== previousProviderSignature
    ) {
      try {
        await sync.uploadSettings(nextSettings);
      } catch (error) {
        chatGeneration.dispatch({ type: 'set-error', message: error instanceof Error ? error.message : '同步上传失败。' });
      }
    }
  }

  async function handleTestProvider(nextSettings: AppSettings) {
    const model = nextSettings.model.trim();

    if (!model) {
      throw new Error('模型名不能为空。');
    }

    const { sendChatRequest, readNonStreamingText } = await import('../transport/chatClient');

    const response = await sendChatRequest({
      model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      temperature: 0,
      max_tokens: 16,
      stream: false
    }, {
      ...nextSettings,
      model,
      stream: false
    }, fetch);

    await readNonStreamingText(response);
  }

  async function handleReset() {
    if (isResettingLocalData) {
      return;
    }

    const retainedSyncAccount = settings.syncAccount;
    const resetSettings = {
      ...defaultSettings,
      syncAccount: retainedSyncAccount
    };

    setIsResettingLocalData(true);
    conversations.startLocalReset();
    chatGeneration.stopGeneration();
    conversations.clearConversationList();
    conversations.createNewConversation();
    chatGeneration.loadMessages([]);

    try {
      await resetLocalData();
      if (retainedSyncAccount?.accessToken.trim()) {
        onSettingsChange(resetSettings);
      } else {
        onSettingsChange(defaultSettings);
      }
      conversations.completeLocalReset();
    } catch {
      conversations.cancelLocalReset();
      chatGeneration.dispatch({ type: 'set-error', message: '清除本机数据失败，请重试。' });
      await conversations.refreshConversations(undefined, true).catch(() => {});
    } finally {
      setIsResettingLocalData(false);
    }
  }

  function handleNewConversation() {
    conversations.createNewConversation();
    chatGeneration.loadMessages([]);
    drawers.closeDrawers();
  }

  function handleSelectConversation(id: string) {
    if (id === conversations.activeConversation.id && chatGeneration.state.messages.length > 0) {
      drawers.closeDrawers();
      return;
    }

    const selected = conversations.conversations.find((c) => c.id === id);
    if (selected) {
      drawers.closeDrawers();
      conversations.switchToConversation(id);
      chatGeneration.loadMessages(selected.messages);
    }
  }

  function handleDeleteConversation(id: string) {
    const removedActiveConversation = conversations.deleteConversationById(id);

    if (removedActiveConversation) {
      chatGeneration.loadMessages([]);
    }
  }

  function handleEditUserMessage(message: Parameters<typeof chatGeneration.editUserMessage>[0]) {
    chatGeneration.editUserMessage(message);
    setDraftText(message.text);
  }

  function handleQuickModelSelect(model: string) {
    if (!activeProvider) {
      return;
    }

    const nextProviders = (settings.providers ?? []).map((provider) => (
      provider.id === activeProvider.id ? {
        ...provider,
        models: provider.models.includes(model) ? provider.models : [...provider.models, model]
      } : provider
    ));

    onSettingsChange({
      ...settings,
      providers: nextProviders,
      selectedProviderId: activeProvider.id,
      selectedModel: model,
      model
    });
  }

  const generationStateLabel = chatGeneration.state.isGenerating ? '生成中' : '就绪';

  const conversationPanel = (
    <ConversationList
      conversations={conversations.conversations}
      activeId={conversations.activeConversation.id}
      onSelect={handleSelectConversation}
      onNew={handleNewConversation}
      onRename={conversations.renameConversation}
      onDelete={handleDeleteConversation}
    />
  );

  const settingsPanel = (
    <SettingsPanel
      settings={settings}
      onSave={handleSaveSettings}
      onResetLocalData={handleReset}
      onFetchModels={(nextSettings) => fetchModelList(nextSettings, fetch)}
      onTestProvider={handleTestProvider}
      syncStatus={sync.syncStatus}
    />
  );

  return (
    <main className="app-shell" data-theme={themeName}>
      {(drawers.isConversationDrawerOpen || drawers.isSettingsDrawerOpen) && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
          aria-label="关闭面板"
          onClick={drawers.closeDrawers}
        />
      )}

      <aside
        className="hidden w-[312px] shrink-0 border-r border-border bg-card/92 lg:block"
        aria-label="会话侧边栏"
        aria-hidden={drawers.isConversationDrawerOpen ? true : undefined}
      >
        {conversationPanel}
      </aside>

      {drawers.isConversationDrawerOpen && (
        <div
          id="conversation-drawer"
          className="fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[340px] border-r border-border bg-card shadow-2xl transition-transform duration-200 lg:hidden"
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background shadow-sm"
            aria-label="关闭会话"
            onClick={drawers.closeDrawers}
          >
            <X aria-hidden="true" size={18} strokeWidth={2.25} />
          </button>
          {conversationPanel}
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col" aria-label="聊天工作区">
        <header className="flex min-h-16 items-center gap-3 border-b border-border bg-card/86 px-3 backdrop-blur-xl sm:px-5" role="banner">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background shadow-sm transition hover:border-primary/45 hover:bg-primary/5 lg:hidden"
            aria-label="打开会话"
            aria-controls="conversation-drawer"
            aria-expanded={drawers.isConversationDrawerOpen}
            onClick={drawers.openConversationDrawer}
          >
            <Menu aria-hidden="true" size={20} strokeWidth={2.25} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-normal sm:text-lg">ChatOnPhone</h1>
              <span className="hidden rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary sm:inline-flex">
                {activeProvider?.name || '未配置'}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{conversations.activeConversation.title}</p>
          </div>

          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <label className="sr-only" htmlFor="quick-model-select">桌面快捷模型</label>
            {quickModelOptions.length > 0 ? (
              <select
                id="quick-model-select"
                aria-label="桌面快捷模型"
                value={settings.model}
                onChange={(event) => handleQuickModelSelect(event.target.value)}
                className="h-10 max-w-[260px] rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                {quickModelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            ) : (
              <span className="max-w-[220px] truncate rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {settings.model || '未设置模型'}
              </span>
            )}
            <div className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm shadow-sm">
              <span className={`h-2 w-2 rounded-full ${chatGeneration.state.isGenerating ? 'bg-accent' : 'bg-primary'}`} />
              {generationStateLabel}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background shadow-sm transition hover:border-primary/45 hover:bg-primary/5 xl:hidden"
            aria-label="打开设置"
            aria-controls="settings-drawer"
            aria-expanded={drawers.isSettingsDrawerOpen}
            onClick={drawers.openSettingsDrawer}
          >
            <SettingsIcon aria-hidden="true" size={19} strokeWidth={2.25} />
          </button>
        </header>

        <div className="flex border-b border-border bg-background/72 px-3 py-2 md:hidden">
          <label className="sr-only" htmlFor="quick-model-select-mobile">快捷模型</label>
          {quickModelOptions.length > 0 ? (
            <select
              id="quick-model-select-mobile"
              aria-label="快捷模型"
              value={settings.model}
              onChange={(event) => handleQuickModelSelect(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            >
              {quickModelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          ) : (
            <span className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {settings.model || '未设置模型'}
            </span>
          )}
          <div className="ml-2 inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm">
            <span className={`h-2 w-2 rounded-full ${chatGeneration.state.isGenerating ? 'bg-accent' : 'bg-primary'}`} />
            {generationStateLabel}
          </div>
        </div>

        {chatGeneration.state.error && <ErrorBanner title="请求失败" detail={chatGeneration.state.error} />}

        <MessageList
          messages={chatGeneration.state.messages}
          onEditUserMessage={handleEditUserMessage}
          onRegenerate={chatGeneration.regenerateMessage}
        />

        <Composer
          isGenerating={chatGeneration.state.isGenerating}
          disabled={isResettingLocalData}
          draftText={draftText}
          onDraftTextChange={setDraftText}
          onSend={chatGeneration.sendMessage}
          onStop={chatGeneration.stopGeneration}
        />
      </section>

      <aside
        className="hidden w-[360px] shrink-0 border-l border-border bg-card/92 xl:block"
        aria-label="设置侧边栏"
        aria-hidden={drawers.isSettingsDrawerOpen ? true : undefined}
      >
        {settingsPanel}
      </aside>

      {drawers.isSettingsDrawerOpen && (
        <div
          id="settings-drawer"
          className="fixed inset-y-0 right-0 z-50 w-[90vw] max-w-[390px] border-l border-border bg-card shadow-2xl transition-transform duration-200 xl:hidden"
        >
          <button
            type="button"
            className="absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background shadow-sm"
            aria-label="关闭设置"
            onClick={drawers.closeDrawers}
          >
            <X aria-hidden="true" size={18} strokeWidth={2.25} />
          </button>
          {settingsPanel}
        </div>
      )}

      <button
        type="button"
        className="fixed bottom-[106px] right-3 z-30 hidden h-10 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium shadow-lg transition hover:border-primary/45 hover:bg-primary/5 lg:inline-flex xl:hidden"
        aria-label="打开设置"
        onClick={drawers.openSettingsDrawer}
      >
        <PanelRightOpen aria-hidden="true" size={17} strokeWidth={2.25} />
        设置
      </button>

      <div className="pointer-events-none fixed left-1/2 top-4 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/85 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur lg:flex xl:hidden">
        <Sparkles aria-hidden="true" size={14} strokeWidth={2.1} className="text-primary" />
        <span>{activeProvider?.name || '未配置供应商'} · {settings.model || '未设置模型'}</span>
      </div>
    </main>
  );
}
