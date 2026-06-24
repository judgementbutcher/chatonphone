import { nanoid } from 'nanoid';
import { LogIn, Menu, Settings as SettingsIcon, UserPlus, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { loginAccount, registerAccount } from './auth/authClient';
import Composer from './components/Composer';
import ConversationList from './components/ConversationList';
import ErrorBanner from './components/ErrorBanner';
import MessageList from './components/MessageList';
import SettingsPanel from './components/SettingsPanel';
import { classifyChatError } from './domain/errors';
import { toOpenAIChatRequest } from './domain/openaiAdapter';
import type { AppSettings, ChatMessage, Conversation } from './domain/types';
import { fileToAttachment, validateFileBatch } from './domain/imageProcessing';
import { chatReducer, initialChatState } from './state/chatReducer';
import { defaultSettings, getActiveProviderSettings, loadSettings, saveSettings } from './settings/settingsStore';
import { deleteConversation, listConversations, resetLocalData, saveConversation } from './storage/conversationRepo';
import { downloadSyncedSettings, uploadSyncedSettings } from './sync/settingsSync';
import { fetchModelList, readNonStreamingText, readStreamingText, sendChatRequest } from './transport/chatClient';

const DEFAULT_CONVERSATION_TITLE = '新会话';
const FILE_CONVERSATION_TITLE = '文件对话';
const CONVERSATION_TITLE_MAX_LENGTH = 28;
const SYNC_RESUME_MIN_INTERVAL_MS = 5000;

function compactMessageText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimConversationTitle(title: string): string {
  return title.length > CONVERSATION_TITLE_MAX_LENGTH
    ? `${title.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}...`
    : title;
}

function deriveConversationTitle(messages: ChatMessage[]): string | null {
  const firstUserMessage = messages.find((message) => message.role === 'user');

  if (!firstUserMessage) {
    return null;
  }

  const textTitle = compactMessageText(firstUserMessage.text);

  if (textTitle) {
    return trimConversationTitle(textTitle);
  }

  return firstUserMessage.attachments.length > 0 ? FILE_CONVERSATION_TITLE : null;
}

function withDerivedConversationTitle(conversation: Conversation): Conversation {
  if (conversation.title !== DEFAULT_CONVERSATION_TITLE) {
    return conversation;
  }

  const derivedTitle = deriveConversationTitle(conversation.messages);

  return derivedTitle ? { ...conversation, title: derivedTitle } : conversation;
}

function newConversation(model: string): Conversation {
  const now = Date.now();

  return {
    id: nanoid(),
    title: DEFAULT_CONVERSATION_TITLE,
    model,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

type AuthAction = 'register' | 'login';

function hasAuthenticatedAccount(settings: AppSettings): boolean {
  return Boolean(settings.syncAccount?.accessToken.trim());
}

function shouldAutoSyncAccount(settings: AppSettings): boolean {
  return hasAuthenticatedAccount(settings) && settings.syncAccount?.autoSync !== false;
}

function accountSettingsFrom(settings: AppSettings, accountId: string): AppSettings {
  return {
    ...settings,
    syncAccount: {
      endpoint: settings.syncAccount?.endpoint ?? '',
      accountId,
      accessToken: '',
      autoSync: true
    }
  };
}

function syncAccountKey(settings: AppSettings): string {
  const account = settings.syncAccount;

  if (!account) {
    return '';
  }

  return [account.endpoint.trim(), account.accountId.trim(), account.accessToken.trim()].join('|');
}

function providerSyncSignature(settings: AppSettings): string {
  const normalized = getActiveProviderSettings(settings);

  return JSON.stringify({
    apiBaseUrl: normalized.apiBaseUrl,
    apiKey: normalized.apiKey,
    model: normalized.model,
    requestMode: normalized.requestMode,
    proxyUrl: normalized.proxyUrl,
    proxyAccessToken: normalized.proxyAccessToken,
    providers: normalized.providers,
    selectedProviderId: normalized.selectedProviderId,
    selectedModel: normalized.selectedModel
  });
}

interface ActiveGeneration {
  generationId: string;
  conversationId: string;
  controller: AbortController;
}

export default function App() {
  const [settings, setSettings] = useState(() => loadSettings());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation>(() => newConversation(defaultSettings.model));
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [draftText, setDraftText] = useState('');
  const [isConversationDrawerOpen, setIsConversationDrawerOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [authAccountId, setAuthAccountId] = useState(settings.syncAccount?.accountId ?? '');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const activeConversationIdRef = useRef(activeConversation.id);
  const persistenceVersionRef = useRef(0);
  const isResettingRef = useRef(false);
  const resetCompletionRef = useRef<Promise<void> | null>(null);
  const resolveResetCompletionRef = useRef<(() => void) | null>(null);
  const deletedConversationIdsRef = useRef(new Set<string>());
  const latestConversationSnapshotsRef = useRef(new Map<string, Conversation>());
  const conversationSaveChainsRef = useRef(new Map<string, Promise<void>>());
  const activeGenerationRef = useRef<ActiveGeneration | null>(null);
  const syncPullInFlightRef = useRef<Promise<void> | null>(null);
  const lastAccountSyncKeyRef = useRef('');
  const lastSyncPullAtRef = useRef(0);
  const activeProvider = settings.providers?.find((provider) => provider.id === settings.selectedProviderId) ?? settings.providers?.[0];
  const quickModelOptions = activeProvider?.models ?? [];
  const themeName = settings.darkMode ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    document.documentElement.style.colorScheme = themeName;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', settings.darkMode ? '#0b1220' : '#edf5fb');
  }, [settings.darkMode, themeName]);

  function activateConversation(conversation: Conversation) {
    activeConversationIdRef.current = conversation.id;
    setActiveConversation(conversation);
  }

  function isActiveGeneration(generation: ActiveGeneration) {
    const activeGeneration = activeGenerationRef.current;

    return (
      activeGeneration?.generationId === generation.generationId &&
      activeGeneration.conversationId === generation.conversationId &&
      activeConversationIdRef.current === generation.conversationId
    );
  }

  function clearActiveGeneration(generation: ActiveGeneration) {
    if (isActiveGeneration(generation)) {
      activeGenerationRef.current = null;
    }
  }

  function abortActiveGeneration() {
    const activeGeneration = activeGenerationRef.current;

    if (!activeGeneration) {
      return;
    }

    activeGeneration.controller.abort();
    activeGenerationRef.current = null;
  }

  function abortActiveGenerationForConversation(conversationId: string) {
    if (activeGenerationRef.current?.conversationId === conversationId) {
      abortActiveGeneration();
    }
  }

  function closeDrawers() {
    setIsConversationDrawerOpen(false);
    setIsSettingsDrawerOpen(false);
  }

  function openConversationDrawer() {
    setIsSettingsDrawerOpen(false);
    setIsConversationDrawerOpen(true);
  }

  function openSettingsDrawer() {
    setIsConversationDrawerOpen(false);
    setIsSettingsDrawerOpen(true);
  }

  async function refreshConversations(expectedPersistenceVersion = persistenceVersionRef.current) {
    const storedConversations = await listConversations();

    if (isResettingRef.current || expectedPersistenceVersion !== persistenceVersionRef.current) {
      return;
    }

    const nextConversations = storedConversations.reduce<Conversation[]>((mergedConversations, storedConversation) => {
      if (deletedConversationIdsRef.current.has(storedConversation.id)) {
        latestConversationSnapshotsRef.current.delete(storedConversation.id);
        return mergedConversations;
      }

      const localConversation = latestConversationSnapshotsRef.current.get(storedConversation.id);
      const hasQueuedSave = conversationSaveChainsRef.current.has(storedConversation.id);
      const conversation =
        localConversation && (hasQueuedSave || localConversation.updatedAt >= storedConversation.updatedAt)
          ? localConversation
          : storedConversation;

      latestConversationSnapshotsRef.current.set(conversation.id, conversation);
      mergedConversations.push(conversation);
      return mergedConversations;
    }, []);

    setConversations(nextConversations.sort((left, right) => right.updatedAt - left.updatedAt));
  }

  async function refreshConversationsIfPossible(expectedPersistenceVersion = persistenceVersionRef.current) {
    try {
      await refreshConversations(expectedPersistenceVersion);
    } catch {
      // Keep the original operation failure visible instead of replacing it with refresh noise.
    }
  }

  async function cleanupInvalidatedConversation(id: string) {
    deletedConversationIdsRef.current.add(id);
    latestConversationSnapshotsRef.current.delete(id);
    setConversations((current) => current.filter((conversation) => conversation.id !== id));

    try {
      await deleteConversation(id);
    } catch {
      dispatch({ type: 'set-error', message: '清理已失效会话失败，请重试。' });
    }
  }

  function startResetAttempt() {
    isResettingRef.current = true;
    resetCompletionRef.current = new Promise<void>((resolve) => {
      resolveResetCompletionRef.current = resolve;
    });
  }

  function finishResetAttempt() {
    isResettingRef.current = false;
    resolveResetCompletionRef.current?.();
    resetCompletionRef.current = null;
    resolveResetCompletionRef.current = null;
  }

  async function waitForResetAttemptToFinish() {
    const resetCompletion = resetCompletionRef.current;

    if (resetCompletion) {
      await resetCompletion;
    }
  }

  function enqueueConversationSave(conversation: Conversation) {
    // Preserve write order per conversation so older autosaves cannot land after newer metadata edits.
    const previousSave = conversationSaveChainsRef.current.get(conversation.id) ?? Promise.resolve();
    const queuedSave = previousSave.catch(() => undefined).then(() => saveConversation(conversation));

    conversationSaveChainsRef.current.set(conversation.id, queuedSave);
    queuedSave.then(
      () => {
        if (conversationSaveChainsRef.current.get(conversation.id) === queuedSave) {
          conversationSaveChainsRef.current.delete(conversation.id);
        }
      },
      () => {
        if (conversationSaveChainsRef.current.get(conversation.id) === queuedSave) {
          conversationSaveChainsRef.current.delete(conversation.id);
        }
      }
    );

    return queuedSave;
  }

  useEffect(() => {
    refreshConversations();
  }, []);

  function isSendContextStale(persistenceVersion: number, conversationId: string) {
    return (
      isResettingRef.current ||
      persistenceVersion !== persistenceVersionRef.current ||
      deletedConversationIdsRef.current.has(conversationId) ||
      activeConversationIdRef.current !== conversationId
    );
  }

  async function generateAssistantResponse(
    generation: ActiveGeneration,
    assistantMessageId: string,
    messagesForRequest: ChatMessage[]
  ): Promise<boolean | void> {
    const controller = generation.controller;

    try {
      const request = toOpenAIChatRequest(messagesForRequest, settings);
      const response = await sendChatRequest(request, settings, fetch, controller.signal);

      if (!isActiveGeneration(generation)) {
        return false;
      }

      if (settings.stream) {
        for await (const delta of readStreamingText(response)) {
          if (!isActiveGeneration(generation)) {
            return false;
          }

          dispatch({ type: 'append-assistant-delta', messageId: assistantMessageId, delta });
        }
      } else {
        const text = await readNonStreamingText(response);

        if (!isActiveGeneration(generation)) {
          return false;
        }

        dispatch({ type: 'replace-assistant-text', messageId: assistantMessageId, text });
      }

      if (isActiveGeneration(generation)) {
        dispatch({ type: 'finish-generation' });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (isActiveGeneration(generation)) {
          dispatch({ type: 'finish-generation' });
        }
        return false;
      }

      if (!isActiveGeneration(generation)) {
        return false;
      }

      const classified = classifyChatError(error);
      dispatch({ type: 'set-error', message: `${classified.title}：${classified.detail}` });
      return false;
    } finally {
      clearActiveGeneration(generation);
    }
  }

  async function handleSend(payload: { text: string; files: File[] }): Promise<boolean | void> {
    const sendPersistenceVersion = persistenceVersionRef.current;
    const sendConversationId = activeConversationIdRef.current;

    if (isSendContextStale(sendPersistenceVersion, sendConversationId)) {
      return false;
    }

    const validation = validateFileBatch(payload.files);

    if (!validation.ok) {
      dispatch({ type: 'set-error', message: validation.message });
      return false;
    }

    let attachments;

    try {
      attachments = await Promise.all(payload.files.map(fileToAttachment));
    } catch (error) {
      if (isSendContextStale(sendPersistenceVersion, sendConversationId)) {
        return false;
      }

      dispatch({ type: 'set-error', message: error instanceof Error ? error.message : '文件处理失败。' });
      return false;
    }

    if (isSendContextStale(sendPersistenceVersion, sendConversationId)) {
      return false;
    }

    const now = Date.now();
    const assistantMessageId = nanoid();
    const controller = new AbortController();
    const generation: ActiveGeneration = {
      generationId: nanoid(),
      conversationId: sendConversationId,
      controller
    };
    const userMessage = {
      id: nanoid(),
      role: 'user' as const,
      text: payload.text,
      attachments,
      createdAt: now
    };
    const nextMessages = [...state.messages, userMessage];

    activeGenerationRef.current = generation;
    dispatch({ type: 'send-user-message', message: userMessage, assistantMessageId, now });

    return await generateAssistantResponse(generation, assistantMessageId, nextMessages);
  }

  function editUserMessage(message: ChatMessage) {
    abortActiveGeneration();
    setDraftText(message.text);
    dispatch({ type: 'finish-generation' });
    dispatch({ type: 'truncate-after-message', messageId: message.id });
  }

  async function regenerateFromLastUserMessage(message: ChatMessage) {
    const regenerationPersistenceVersion = persistenceVersionRef.current;
    const regenerationConversationId = activeConversationIdRef.current;

    if (message.role !== 'assistant' || isSendContextStale(regenerationPersistenceVersion, regenerationConversationId)) {
      return;
    }

    const messagesForRequest = state.messages.filter((currentMessage) => currentMessage.id !== message.id);

    if (!messagesForRequest.some((currentMessage) => currentMessage.role === 'user')) {
      return;
    }

    const now = Date.now();
    const assistantMessageId = nanoid();
    const controller = new AbortController();
    const generation: ActiveGeneration = {
      generationId: nanoid(),
      conversationId: regenerationConversationId,
      controller
    };

    abortActiveGeneration();
    activeGenerationRef.current = generation;
    dispatch({ type: 'remove-message', messageId: message.id });
    dispatch({ type: 'begin-assistant-message', messageId: assistantMessageId, now });

    await generateAssistantResponse(generation, assistantMessageId, messagesForRequest);
  }

  function handleStop() {
    abortActiveGeneration();
    dispatch({ type: 'finish-generation' });
  }

  function persistSettings(nextSettings: typeof settings) {
    const normalizedSettings = getActiveProviderSettings(nextSettings);

    saveSettings(normalizedSettings);
    setSettings(normalizedSettings);

    return normalizedSettings;
  }

  function markAccountSynced(accountSettings: AppSettings) {
    lastAccountSyncKeyRef.current = syncAccountKey(accountSettings);
    lastSyncPullAtRef.current = Date.now();
  }

  async function pullSyncedAccountSettings(reason: 'startup' | 'resume'): Promise<void> {
    const currentSettings = loadSettings();

    if (!shouldAutoSyncAccount(currentSettings)) {
      return;
    }

    const currentAccountKey = syncAccountKey(currentSettings);
    const now = Date.now();

    if (reason === 'startup' && lastAccountSyncKeyRef.current === currentAccountKey) {
      return;
    }

    if (reason === 'resume' && now - lastSyncPullAtRef.current < SYNC_RESUME_MIN_INTERVAL_MS) {
      return;
    }

    if (syncPullInFlightRef.current) {
      return syncPullInFlightRef.current;
    }

    const syncPull = (async () => {
      try {
        const account = currentSettings.syncAccount!;
        const downloadedSettings = await downloadSyncedSettings(account, currentSettings);

        persistSettings({
          ...downloadedSettings,
          syncAccount: account
        });
        markAccountSynced({
          ...downloadedSettings,
          syncAccount: account
        });
        setSyncStatus(reason === 'startup' ? '已同步账号设置' : '同步已更新');
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          lastSyncPullAtRef.current = Date.now();
          setSyncStatus('暂无远端设置');
          return;
        }

        const classified = classifyChatError(error);

        setSyncStatus(`同步拉取失败：${classified.detail}`);
      } finally {
        syncPullInFlightRef.current = null;
      }
    })();

    syncPullInFlightRef.current = syncPull;

    return syncPull;
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

    persistSettings({
      ...settings,
      providers: nextProviders,
      selectedProviderId: activeProvider.id,
      selectedModel: model,
      model
    });
  }

  function authPayloadFrom(nextSettings: AppSettings, password: string) {
    const account = nextSettings.syncAccount;

    if (!account) {
      throw new Error('同步账号信息不完整。');
    }

    return {
      endpoint: account.endpoint,
      accountId: account.accountId,
      password,
      autoSync: true
    };
  }

  async function handleAuthGateSubmit(action: AuthAction) {
    if (isAuthenticating) {
      return;
    }

    setIsAuthenticating(true);
    setAuthError('');

    const baseSettings = accountSettingsFrom(settings, authAccountId);

    try {
      if (action === 'register') {
        const account = await registerAccount(authPayloadFrom(baseSettings, authPassword));
        const accountSettings = {
          ...baseSettings,
          syncAccount: account
        };

        markAccountSynced(accountSettings);
        const normalizedSettings = persistSettings({
          ...accountSettings,
          syncAccount: account
        });

        await uploadSyncedSettings(normalizedSettings);
        setSyncStatus('账号已注册并上传同步');
        setAuthPassword('');
        return;
      }

      const account = await loginAccount(authPayloadFrom(baseSettings, authPassword));
      const accountSettings = {
        ...baseSettings,
        syncAccount: account
      };

      markAccountSynced(accountSettings);
      const normalizedSettings = persistSettings({
        ...accountSettings,
        syncAccount: account
      });
      const downloadedSettings = await downloadSyncedSettings(account, normalizedSettings);

      persistSettings({
        ...downloadedSettings,
        syncAccount: account
      });
      markAccountSynced({
        ...downloadedSettings,
        syncAccount: account
      });
      setSyncStatus('已登录并同步');
      setAuthPassword('');
    } catch (error) {
      const classified = classifyChatError(error);
      setAuthError(`${classified.title}：${classified.detail}`);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleUploadSync(nextSettings: typeof settings) {
    const normalizedSettings = persistSettings(nextSettings);

    try {
      await uploadSyncedSettings(normalizedSettings);
      setSyncStatus('同步已上传');
    } catch (error) {
      const classified = classifyChatError(error);
      dispatch({ type: 'set-error', message: `同步上传失败：${classified.detail}` });
    }
  }

  async function handleSaveSettings(nextSettings: typeof settings) {
    const previousProviderSignature = providerSyncSignature(settings);
    const normalizedSettings = persistSettings(nextSettings);

    setIsSettingsDrawerOpen(false);

    if (
      normalizedSettings.syncAccount?.accessToken.trim() &&
      providerSyncSignature(normalizedSettings) !== previousProviderSignature
    ) {
      await handleUploadSync(normalizedSettings);
    }
  }

  async function handleTestProvider(nextSettings: typeof settings) {
    const activeSettings = getActiveProviderSettings(nextSettings);
    const model = activeSettings.model.trim();

    if (!model) {
      throw new Error('模型名不能为空。');
    }

    const response = await sendChatRequest({
      model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      temperature: 0,
      max_tokens: 16,
      stream: false
    }, {
      ...activeSettings,
      model,
      stream: false
    }, fetch);

    await readNonStreamingText(response);
  }

  async function handleReset() {
    if (isResettingRef.current) {
      return;
    }

    const persistenceVersion = persistenceVersionRef.current;
    let shouldReconcileAfterFailedReset = false;
    const retainedSyncAccount = settings.syncAccount;
    const resetSettings = {
      ...defaultSettings,
      syncAccount: retainedSyncAccount
    };

    abortActiveGeneration();
    startResetAttempt();
    deletedConversationIdsRef.current.clear();
    latestConversationSnapshotsRef.current.clear();
    setSettings(resetSettings);
    setConversations([]);
    activateConversation(newConversation(resetSettings.model));
    dispatch({ type: 'load-messages', messages: [] });

    try {
      await resetLocalData();
      if (retainedSyncAccount?.accessToken.trim()) {
        saveSettings(resetSettings);
      }
      persistenceVersionRef.current += 1;
      conversationSaveChainsRef.current.clear();
    } catch {
      setSettings(loadSettings());
      dispatch({ type: 'set-error', message: '清除本机数据失败，请重试。' });
      shouldReconcileAfterFailedReset = true;
    } finally {
      finishResetAttempt();
    }

    if (shouldReconcileAfterFailedReset) {
      await refreshConversationsIfPossible(persistenceVersion);
    }
  }

  async function handleNewConversation() {
    const conversation = newConversation(settings.model);
    abortActiveGeneration();
    activateConversation(conversation);
    dispatch({ type: 'load-messages', messages: [] });
    setIsConversationDrawerOpen(false);
  }

  async function handleDeleteConversation(id: string) {
    if (deletedConversationIdsRef.current.has(id)) {
      return;
    }

    const persistenceVersion = persistenceVersionRef.current;

    deletedConversationIdsRef.current.add(id);
    latestConversationSnapshotsRef.current.delete(id);
    setConversations((current) => current.filter((conversation) => conversation.id !== id));

    if (activeConversationIdRef.current === id) {
      abortActiveGenerationForConversation(id);
      activateConversation(newConversation(settings.model));
      dispatch({ type: 'load-messages', messages: [] });
    }

    try {
      await deleteConversation(id);
      conversationSaveChainsRef.current.delete(id);
    } catch {
      deletedConversationIdsRef.current.delete(id);
      dispatch({ type: 'set-error', message: '删除会话失败，请重试。' });
      await refreshConversationsIfPossible(persistenceVersion);
      return;
    }

    await refreshConversations(persistenceVersion);
  }

  async function handleRenameConversation(id: string, title: string) {
    if (deletedConversationIdsRef.current.has(id)) {
      return;
    }

    const target = conversations.find((conversation) => conversation.id === id);

    if (!target) {
      return;
    }

    const persistenceVersion = persistenceVersionRef.current;
    const latestConversation = latestConversationSnapshotsRef.current.get(id) ?? target;
    const renamed = {
      ...latestConversation,
      title,
      updatedAt: Date.now()
    };

    latestConversationSnapshotsRef.current.set(id, renamed);
    setConversations((current) => current.map((conversation) => (conversation.id === id ? renamed : conversation)));

    try {
      await enqueueConversationSave(renamed);
    } catch (error) {
      await waitForResetAttemptToFinish();

      if (persistenceVersion === persistenceVersionRef.current && !deletedConversationIdsRef.current.has(id)) {
        dispatch({ type: 'set-error', message: error instanceof Error ? error.message : '重命名会话失败。' });
      }
      return;
    }

    await waitForResetAttemptToFinish();

    if (persistenceVersion !== persistenceVersionRef.current || deletedConversationIdsRef.current.has(id)) {
      latestConversationSnapshotsRef.current.delete(id);
      await cleanupInvalidatedConversation(id);
      return;
    }

    if (activeConversation.id === id) {
      setActiveConversation((current) => (current.id === id ? { ...current, title, updatedAt: renamed.updatedAt } : current));
    }
    await refreshConversations(persistenceVersion);
  }

  useEffect(() => {
    const latestConversation = latestConversationSnapshotsRef.current.get(activeConversation.id) ?? activeConversation;
    const conversation = withDerivedConversationTitle({
      ...activeConversation,
      ...latestConversation,
      messages: state.messages,
      model: settings.model,
      updatedAt: Date.now()
    });

    if (state.messages.length > 0) {
      const persistenceVersion = persistenceVersionRef.current;

      if (deletedConversationIdsRef.current.has(conversation.id)) {
        return;
      }

      latestConversationSnapshotsRef.current.set(conversation.id, conversation);
      if (conversation.title !== activeConversation.title) {
        setActiveConversation((current) => (
          current.id === conversation.id && current.title === DEFAULT_CONVERSATION_TITLE
            ? { ...current, title: conversation.title, updatedAt: conversation.updatedAt }
            : current
        ));
      }

      enqueueConversationSave(conversation)
        .then(async () => {
          await waitForResetAttemptToFinish();

          if (persistenceVersion !== persistenceVersionRef.current || deletedConversationIdsRef.current.has(conversation.id)) {
            latestConversationSnapshotsRef.current.delete(conversation.id);
            await cleanupInvalidatedConversation(conversation.id);
            return;
          }

          await refreshConversations(persistenceVersion);
        })
        .catch(async (error) => {
          await waitForResetAttemptToFinish();

          if (persistenceVersion === persistenceVersionRef.current && !deletedConversationIdsRef.current.has(conversation.id)) {
            dispatch({ type: 'set-error', message: error instanceof Error ? error.message : '保存会话失败。' });
          }
      });
    }
  }, [activeConversation, settings.model, state.messages]);

  useEffect(() => {
    if (!shouldAutoSyncAccount(settings)) {
      return;
    }

    void pullSyncedAccountSettings('startup');
  }, [settings.syncAccount?.endpoint, settings.syncAccount?.accountId, settings.syncAccount?.accessToken]);

  useEffect(() => {
    if (!shouldAutoSyncAccount(settings)) {
      return;
    }

    function handleResume() {
      if (document.visibilityState === 'visible') {
        void pullSyncedAccountSettings('resume');
      }
    }

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [settings.syncAccount?.endpoint, settings.syncAccount?.accountId, settings.syncAccount?.accessToken]);

  if (!hasAuthenticatedAccount(settings)) {
    return (
      <main className="authShell" data-theme={themeName}>
        <form
          className="authPanel"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAuthGateSubmit('login');
          }}
        >
          <div className="authHeader">
            <h1>ChatOnPhone</h1>
            <h2>登录或注册</h2>
          </div>
          <label>
            账号
            <input
              value={authAccountId}
              autoComplete="username"
              onChange={(event) => setAuthAccountId(event.target.value)}
            />
          </label>
          <label>
            登录密码
            <input
              value={authPassword}
              type="password"
              autoComplete="current-password"
              onChange={(event) => setAuthPassword(event.target.value)}
            />
          </label>
          {authError && (
            <div className="authError" role="alert">
              {authError}
            </div>
          )}
          <div className="authActions">
            <button
              type="button"
              className="secondaryButton"
              disabled={isAuthenticating}
              onClick={() => void handleAuthGateSubmit('register')}
            >
              <UserPlus aria-hidden="true" size={17} strokeWidth={2.25} />
              注册
            </button>
            <button type="submit" className="primaryButton" disabled={isAuthenticating}>
              <LogIn aria-hidden="true" size={17} strokeWidth={2.25} />
              登录
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="appShell" data-theme={themeName}>
      <header className="topBar">
        <button
          type="button"
          className="iconButton topAction"
          aria-label="打开会话"
          aria-controls="conversation-drawer"
          aria-expanded={isConversationDrawerOpen}
          onClick={openConversationDrawer}
        >
          <Menu aria-hidden="true" size={21} strokeWidth={2.25} />
        </button>
        <div className="topTitle">
          <h1>ChatOnPhone</h1>
          <p>{activeConversation.title}</p>
        </div>
        <button
          type="button"
          className="iconButton topAction"
          aria-label="打开设置"
          aria-controls="settings-drawer"
          aria-expanded={isSettingsDrawerOpen}
          onClick={openSettingsDrawer}
        >
          <SettingsIcon aria-hidden="true" size={21} strokeWidth={2.25} />
        </button>
      </header>
      <div className="workspace">
        {(isConversationDrawerOpen || isSettingsDrawerOpen) && (
          <button type="button" className="drawerBackdrop" aria-label="关闭面板" onClick={closeDrawers} />
        )}
        <div
          id="conversation-drawer"
          className="drawer drawer-left"
          data-open={isConversationDrawerOpen}
        >
          <div className="drawerChrome">
            <button type="button" className="iconButton drawerClose" aria-label="关闭会话" onClick={() => setIsConversationDrawerOpen(false)}>
              <X aria-hidden="true" size={20} strokeWidth={2.25} />
            </button>
            <ConversationList
              conversations={conversations}
              activeId={activeConversation.id}
              onSelect={(id) => {
                if (deletedConversationIdsRef.current.has(id)) {
                  return;
                }

                const selected = conversations.find((conversation) => conversation.id === id);
                if (selected) {
                  setIsConversationDrawerOpen(false);
                  if (selected.id === activeConversationIdRef.current) {
                    return;
                  }

                  abortActiveGeneration();
                  activateConversation(selected);
                  dispatch({ type: 'load-messages', messages: selected.messages });
                }
              }}
              onNew={handleNewConversation}
              onRename={handleRenameConversation}
              onDelete={handleDeleteConversation}
            />
          </div>
        </div>
        <section className="chatPanel">
          <div className="chatMetaBar">
            {quickModelOptions.length > 0 ? (
              <label className="quickModelSelect">
                <span>快捷模型</span>
                <select value={settings.model} onChange={(event) => handleQuickModelSelect(event.target.value)}>
                  {quickModelOptions.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span>{settings.model || '未设置模型'}</span>
            )}
            <span>{state.isGenerating ? '生成中' : '就绪'}</span>
          </div>
          {state.error && <ErrorBanner title="请求失败" detail={state.error} />}
          <MessageList
            messages={state.messages}
            onEditUserMessage={editUserMessage}
            onRegenerate={regenerateFromLastUserMessage}
          />
          <Composer
            isGenerating={state.isGenerating}
            draftText={draftText}
            onDraftTextChange={setDraftText}
            onSend={handleSend}
            onStop={handleStop}
          />
        </section>
        <div
          id="settings-drawer"
          className="drawer drawer-right"
          data-open={isSettingsDrawerOpen}
        >
          <div className="drawerChrome">
            <button type="button" className="iconButton drawerClose" aria-label="关闭设置" onClick={() => setIsSettingsDrawerOpen(false)}>
              <X aria-hidden="true" size={20} strokeWidth={2.25} />
            </button>
            <SettingsPanel
              settings={settings}
              onSave={handleSaveSettings}
              onResetLocalData={handleReset}
              onFetchModels={(nextSettings) => fetchModelList(nextSettings, fetch)}
              onTestProvider={handleTestProvider}
              syncStatus={syncStatus}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
