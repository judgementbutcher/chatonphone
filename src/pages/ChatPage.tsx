import * as Dialog from '@radix-ui/react-dialog';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Search, Settings as SettingsIcon, X } from 'lucide-react';
import type { AppSettings, ChatMessage } from '../domain/types';
import { useDrawers } from '../hooks/useDrawers';
import { useConversations } from '../hooks/useConversations';
import { useChatGeneration } from '../hooks/useChatGeneration';
import { useSyncManager, useAutoSync, providerSyncSignature } from '../hooks/useSyncManager';
import { resetLocalData, searchConversationMessages } from '../storage/conversationRepo';
import { defaultSettings } from '../settings/settingsStore';
import { fetchModelList, readNonStreamingText, sendChatRequest } from '../transport/chatClient';
import Composer from '../components/Composer';
import type { Command } from '../components/CommandPalette';
import ConversationList from '../components/ConversationList';
import ErrorBanner from '../components/ErrorBanner';
import ModelSelector from '../components/ModelSelector';
import PersonaSelector from '../components/PersonaSelector';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';

const CommandPalette = lazy(() => import('../components/CommandPalette'));
const messageListModulePromise = import('../components/MessageList');
const settingsPanelModulePromise = import('../components/SettingsPanel');
const MessageList = lazy(() => messageListModulePromise);
const SettingsPanel = lazy(() => settingsPanelModulePromise);

interface ChatPageProps {
  settings: AppSettings;
  themeName: string;
  onSettingsChange: (settings: AppSettings) => void;
}

// IDB writes happen on every streamed delta, which is wasteful during fast
// model output. We coalesce changes through this debounce window and rely on
// the explicit flush triggers below to guarantee durability.
const STREAMING_SAVE_DEBOUNCE_MS = 1000;

export default function ChatPage({ settings, themeName, onSettingsChange }: ChatPageProps) {
  const [draftText, setDraftText] = useState('');
  const [isResettingLocalData, setIsResettingLocalData] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const activeChatModel = settings.chatModel || settings.model || quickModelOptions[0] || '';
  const visibleQuickModelOptions =
    activeChatModel && !quickModelOptions.includes(activeChatModel)
      ? [activeChatModel, ...quickModelOptions]
      : quickModelOptions;

  useAutoSync(settings, sync.pullSyncedSettings, onSettingsChange);

  // Debounced IDB persistence: streamed deltas append to the last assistant
  // message many times per second, which used to issue one IDB write per
  // delta. We now coalesce text-only updates through a debounce window while
  // flushing immediately on structural changes (new/removed messages) and on
  // lifecycle transitions so durability is preserved.
  const pendingMessagesRef = useRef<ChatMessage[] | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMessagesCountRef = useRef(chatGeneration.state.messages.length);
  const previousIsGeneratingRef = useRef(chatGeneration.state.isGenerating);
  const previousConversationIdRef = useRef(conversations.activeConversation.id);
  const saveConversationWithMessagesRef = useRef(conversations.saveConversationWithMessages);

  saveConversationWithMessagesRef.current = conversations.saveConversationWithMessages;

  function showFeedback(message: string) {
    setFeedbackMessage(message);
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setFeedbackMessage('');
      feedbackTimerRef.current = null;
    }, 1400);
  }

  function handleCloseDrawers() {
    if (drawers.isSettingsDrawerOpen) {
      handleSettingsDialogOpenChange(false);
      return;
    }

    drawers.closeDrawers();
    showFeedback('已关闭');
  }

  function handleSettingsDialogOpenChange(open: boolean) {
    if (open) {
      drawers.openSettingsDrawer();
      return;
    }

    if (isSettingsDirty && !window.confirm('放弃未保存的设置更改？')) {
      return;
    }

    setIsSettingsDirty(false);
    drawers.closeDrawers();
  }

  function flushPendingSave() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const pending = pendingMessagesRef.current;
    if (pending) {
      pendingMessagesRef.current = null;
      saveConversationWithMessagesRef.current(pending);
    }
  }

  // Save policy: when the message array shape changes (send/receive/edit/
  // remove) we save right away so the sidebar picks up the new conversation
  // promptly. When only the trailing assistant message's text grows we
  // debounce, since that's the streaming-delta path.
  useEffect(() => {
    const messages = chatGeneration.state.messages;
    pendingMessagesRef.current = messages;

    const isStructuralChange = messages.length !== previousMessagesCountRef.current;
    previousMessagesCountRef.current = messages.length;

    if (isStructuralChange) {
      flushPendingSave();
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const pending = pendingMessagesRef.current;
      if (pending) {
        pendingMessagesRef.current = null;
        saveConversationWithMessagesRef.current(pending);
      }
    }, STREAMING_SAVE_DEBOUNCE_MS);
  }, [chatGeneration.state.messages]);

  // Flush whenever generation finishes (success or abort) so the final
  // assistant text lands in IDB immediately.
  useEffect(() => {
    if (previousIsGeneratingRef.current && !chatGeneration.state.isGenerating) {
      flushPendingSave();
    }
    previousIsGeneratingRef.current = chatGeneration.state.isGenerating;
  }, [chatGeneration.state.isGenerating]);

  // Flush when switching conversations so in-flight saves don't get attributed
  // to the wrong conversation snapshot.
  useEffect(() => {
    if (previousConversationIdRef.current !== conversations.activeConversation.id) {
      flushPendingSave();
      previousConversationIdRef.current = conversations.activeConversation.id;
    }
  }, [conversations.activeConversation.id]);

  // Flush on unmount and on tab close so the tail of an interrupted stream
  // makes it to storage.
  useEffect(() => {
    function handleBeforeUnload() {
      flushPendingSave();
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushPendingSave();
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  async function handleSaveSettings(nextSettings: AppSettings) {
    const previousProviderSignature = providerSyncSignature(settings);
    setIsSettingsDirty(false);
    onSettingsChange(nextSettings);
    drawers.closeDrawers();
    showFeedback('设置已保存');

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
    const model = (nextSettings.selectedModel || nextSettings.model).trim();

    if (!model) {
      throw new Error('默认聊天模型不能为空。');
    }

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
      setIsSettingsDirty(false);
      drawers.closeDrawers();
      return;
    }

    const retainedSyncAccount = settings.syncAccount;
    const resetSettings = {
      ...defaultSettings,
      syncAccount: retainedSyncAccount
    };

    setIsSettingsDirty(false);
    drawers.closeDrawers();
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
      setIsSettingsDirty(false);
      drawers.closeDrawers();
    }
  }

  function handleNewConversation() {
    conversations.createNewConversation();
    chatGeneration.loadMessages([]);
    drawers.closeDrawers();
  }

  async function handleSelectConversation(id: string) {
    if (id === conversations.activeConversation.id && chatGeneration.state.messages.length > 0) {
      drawers.closeDrawers();
      return;
    }

    const selected = await conversations.switchToConversation(id);
    if (selected) {
      drawers.closeDrawers();
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
      model,
      chatModel: model
    });
  }

  function handlePersonaChange(personaId: string | undefined, prompt: string | undefined) {
    // Snapshot the prompt onto the conversation and persist immediately so the
    // binding survives reloads even before the next message is sent.
    conversations.setActiveConversationPersona(personaId, prompt);
    conversations.saveConversationWithMessages(chatGeneration.state.messages, { force: true });
  }

  function handleDismissError() {
    chatGeneration.dispatch({ type: 'set-error', message: '' });
  }

  function handleRetryGeneration() {
    // The terminal assistant message is what `regenerateMessage` expects;
    // wiring "重试" to it covers the common "request failed mid-stream" case.
    const terminalMessage = chatGeneration.state.messages[chatGeneration.state.messages.length - 1];

    if (terminalMessage && terminalMessage.role === 'assistant') {
      void chatGeneration.regenerateMessage(terminalMessage);
    }
  }

  function handleDeleteMessage(id: string) {
    chatGeneration.dispatch({ type: 'delete-message', messageId: id });
  }

  function handleUpdateMessageContent(id: string, text: string) {
    chatGeneration.dispatch({ type: 'update-message-content', messageId: id, text });
  }

  function handleQuoteMessage(text: string) {
    // Prefix each line with a Markdown quote marker and append a blank line so
    // the user can type their follow-up right after the quoted excerpt.
    const quoted = text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    setDraftText((current) => (current.trim() ? `${current}\n\n${quoted}\n\n` : `${quoted}\n\n`));
  }

  function handleUsePrompt(text: string) {
    setDraftText(text);
  }

  function handleClearCurrentConversation() {
    // Wipe the visible transcript without deleting the conversation record so
    // the user keeps the same conversation slot but starts from a clean slate.
    chatGeneration.stopGeneration();
    chatGeneration.loadMessages([]);
  }

  function handleExportCurrentConversation() {
    const exportPayload = {
      title: conversations.activeConversation.title,
      exportedAt: new Date().toISOString(),
      messages: chatGeneration.state.messages.map((message) => ({
        role: message.role,
        text: message.text,
        createdAt: message.createdAt
      }))
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeTitle = conversations.activeConversation.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 64) || 'conversation';
    link.download = `${safeTitle}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showFeedback('已导出');
  }

  function handlePaletteCommand(command: Command) {
    switch (command.type) {
      case 'new':
        handleNewConversation();
        break;
      case 'jump-conversation':
        handleSelectConversation(command.payload);
        break;
      case 'switch-model':
        handleQuickModelSelect(command.payload);
        break;
      case 'open-settings':
        drawers.openSettingsDrawer();
        break;
      case 'clear-current':
        handleClearCurrentConversation();
        break;
      case 'export-current':
        handleExportCurrentConversation();
        break;
    }
  }

  const handleSearchMessages = useCallback((query: string, limit: number) => {
    return searchConversationMessages(query, limit);
  }, []);

  function focusComposer() {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="消息内容"]');
    textarea?.focus();
  }

  function loadLastUserMessage() {
    const lastUserMessage = [...chatGeneration.state.messages].reverse().find((message) => message.role === 'user');
    if (lastUserMessage) {
      setDraftText(lastUserMessage.text);
    }
  }

  useGlobalHotkeys({
    onNewConversation: handleNewConversation,
    onTogglePalette: () => setIsCommandPaletteOpen((current) => !current),
    onOpenSettings: drawers.openSettingsDrawer,
    onToggleConversations: () => {
      if (drawers.isConversationDrawerOpen) {
        drawers.closeDrawers();
      } else {
        drawers.openConversationDrawer();
      }
    },
    onEscape: () => {
      if (isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
        return;
      }
      if (drawers.isSettingsDrawerOpen) {
        handleSettingsDialogOpenChange(false);
        return;
      }
      if (drawers.isConversationDrawerOpen) {
        drawers.closeDrawers();
        return;
      }
      if (chatGeneration.state.isGenerating) {
        chatGeneration.stopGeneration();
      }
    },
    focusComposer,
    loadLastUserMessage
  });

  const generationStateLabel = chatGeneration.state.isGenerating ? '生成中' : '就绪';
  const terminalMessage = chatGeneration.state.messages[chatGeneration.state.messages.length - 1];
  const canRetry = !chatGeneration.state.isGenerating && terminalMessage?.role === 'assistant';

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
    <Suspense fallback={<div className="p-5 text-sm text-muted-foreground">加载设置...</div>}>
      <SettingsPanel
        settings={settings}
        onSave={handleSaveSettings}
        onResetLocalData={handleReset}
        onFetchModels={(nextSettings) => fetchModelList(nextSettings, fetch)}
        onTestProvider={handleTestProvider}
        onCancel={() => handleSettingsDialogOpenChange(false)}
        onDirtyChange={setIsSettingsDirty}
        syncStatus={sync.syncStatus}
      />
    </Suspense>
  );

  return (
    <main className="app-shell" data-theme={themeName}>
      {drawers.isConversationDrawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 animate-fade-up bg-slate-950/[0.36] backdrop-blur-sm lg:hidden"
          aria-label="关闭面板"
          onClick={handleCloseDrawers}
        />
      )}

      <aside
        className="soft-divider-right hidden w-[320px] shrink-0 bg-card/[0.48] backdrop-blur-2xl lg:block"
        aria-label="会话侧边栏"
        aria-hidden={drawers.isConversationDrawerOpen ? true : undefined}
      >
        {conversationPanel}
      </aside>

      {drawers.isConversationDrawerOpen && (
        <div
          id="conversation-drawer"
          className="drawer-slide-left glass-panel-strong fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[348px] rounded-r-[1.6rem] lg:hidden"
        >
          <button
            type="button"
            className="soft-action absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full"
            aria-label="关闭会话"
            onClick={handleCloseDrawers}
          >
            <X aria-hidden="true" size={18} strokeWidth={2.25} />
          </button>
          {conversationPanel}
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col" aria-label="聊天工作区">
        <header className="soft-divider-bottom flex min-h-16 items-center gap-3 bg-background/85 px-3 backdrop-blur-xl sm:px-5" role="banner">
          <button
            type="button"
            className="soft-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden"
            aria-label="打开会话"
            aria-controls="conversation-drawer"
            aria-expanded={drawers.isConversationDrawerOpen}
            onClick={drawers.openConversationDrawer}
          >
            <Menu aria-hidden="true" size={20} strokeWidth={2.25} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold sm:text-lg">ChatOnPhone</h1>
              <span className="chip hidden rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
                {activeProvider?.name || '未配置'}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{conversations.activeConversation.title}</p>
          </div>

          <button
            type="button"
            className="soft-action inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground"
            aria-label="打开命令面板"
            aria-keyshortcuts="Control+K Meta+K"
            onClick={() => setIsCommandPaletteOpen(true)}
          >
            <Search aria-hidden="true" size={17} strokeWidth={2.25} />
            <span className="hidden lg:inline">搜索命令</span>
            <kbd className="hidden rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--hairline)/0.6)] lg:inline">
              ⌘K
            </kbd>
          </button>

          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <label className="sr-only" htmlFor="quick-model-select">桌面模型选择</label>
            {visibleQuickModelOptions.length > 0 ? (
              <ModelSelector
                id="quick-model-select"
                ariaLabel="桌面模型选择"
                models={visibleQuickModelOptions}
                value={activeChatModel}
                onChange={handleQuickModelSelect}
                className="max-w-[260px]"
              />
            ) : (
              <span className="chip max-w-[220px] truncate rounded-full px-3.5 py-2 text-sm text-muted-foreground">
                {activeChatModel || '未设置模型'}
              </span>
            )}
            <PersonaSelector
              personas={settings.personas ?? []}
              selectedPersonaId={conversations.activeConversation.personaId}
              onChange={handlePersonaChange}
              disabled={chatGeneration.state.isGenerating}
            />
            <div className="chip inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm">
              <span className={`status-dot h-2 w-2 rounded-full ${chatGeneration.state.isGenerating ? 'bg-accent' : 'bg-primary'}`} />
              {generationStateLabel}
            </div>
          </div>

          <button
            type="button"
            className="soft-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            aria-label="打开设置"
            aria-controls="settings-center"
            aria-expanded={drawers.isSettingsDrawerOpen}
            onClick={drawers.openSettingsDrawer}
          >
            <SettingsIcon aria-hidden="true" size={19} strokeWidth={2.25} />
          </button>
        </header>

        <div className="soft-divider-bottom flex items-center gap-2 bg-background/80 px-3 py-2 backdrop-blur-xl md:hidden">
          <label className="sr-only" htmlFor="quick-model-select-mobile">快捷模型</label>
          {visibleQuickModelOptions.length > 0 ? (
            <ModelSelector
              id="quick-model-select-mobile"
              ariaLabel="快捷模型"
              models={visibleQuickModelOptions}
              value={activeChatModel}
              onChange={handleQuickModelSelect}
              className="min-w-0 flex-1"
            />
          ) : (
            <span className="chip min-w-0 flex-1 truncate rounded-full px-3.5 py-2 text-sm text-muted-foreground">
              {activeChatModel || '未设置模型'}
            </span>
          )}
          <PersonaSelector
            personas={settings.personas ?? []}
            selectedPersonaId={conversations.activeConversation.personaId}
            onChange={handlePersonaChange}
            disabled={chatGeneration.state.isGenerating}
          />
          <div className="chip inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm">
            <span className={`status-dot h-2 w-2 rounded-full ${chatGeneration.state.isGenerating ? 'bg-accent' : 'bg-primary'}`} />
            {generationStateLabel}
          </div>
        </div>

        {chatGeneration.state.error && (
          <ErrorBanner
            title="请求失败"
            detail={chatGeneration.state.error}
            onDismiss={handleDismissError}
            onRetry={canRetry ? handleRetryGeneration : undefined}
          />
        )}

        <Suspense fallback={<div className="min-h-0 flex-1" />}>
          <MessageList
            messages={chatGeneration.state.messages}
            onEditUserMessage={handleEditUserMessage}
            onRegenerate={chatGeneration.regenerateMessage}
            onDeleteMessage={handleDeleteMessage}
            onUpdateMessageContent={handleUpdateMessageContent}
            onQuoteMessage={handleQuoteMessage}
            onSwitchVersion={chatGeneration.switchVersion}
            onOpenSettings={drawers.openSettingsDrawer}
            onUsePrompt={handleUsePrompt}
            hasProviders={(settings.providers?.length ?? 0) > 0}
            isGenerating={chatGeneration.state.isGenerating}
          />
        </Suspense>

        <Composer
          isGenerating={chatGeneration.state.isGenerating}
          disabled={isResettingLocalData}
          draftText={draftText}
          onDraftTextChange={setDraftText}
          onSend={chatGeneration.sendMessage}
          onStop={chatGeneration.stopGeneration}
        />
      </section>

      <Dialog.Root open={drawers.isSettingsDrawerOpen} onOpenChange={handleSettingsDialogOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-[100] bg-foreground/40 backdrop-blur-sm" />
          <Dialog.Content
            id="settings-center"
            className="animate-pop-in glass-panel-strong fixed inset-0 z-[110] flex h-dvh w-screen flex-col overflow-hidden rounded-none outline-none lg:left-1/2 lg:top-1/2 lg:inset-auto lg:h-[min(86vh,760px)] lg:w-[min(92vw,1040px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl"
          >
            <Dialog.Title className="sr-only">设置中心</Dialog.Title>
            <button
              type="button"
              className="soft-action absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full"
              aria-label="关闭设置"
              onClick={() => handleSettingsDialogOpenChange(false)}
            >
              <X aria-hidden="true" size={18} strokeWidth={2.25} />
            </button>
            {drawers.isSettingsDrawerOpen && settingsPanel}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={isCommandPaletteOpen}
            onOpenChange={setIsCommandPaletteOpen}
            conversations={conversations.conversations}
            activeConversationId={conversations.activeConversation.id}
            providers={settings.providers ?? []}
            activeProviderId={settings.selectedProviderId}
            selectedModel={activeChatModel}
            onSearchMessages={handleSearchMessages}
            onCommand={handlePaletteCommand}
          />
        </Suspense>
      )}

      {feedbackMessage && (
        <div
          className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full bg-foreground px-3.5 py-2 text-xs font-medium text-background shadow-lg"
          role="status"
          aria-live="polite"
        >
          {feedbackMessage}
        </div>
      )}
    </main>
  );
}
