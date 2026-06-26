import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { AppSettings, ChatMessage, Conversation } from '../domain/types';
import { deleteConversation, listConversations, saveConversation } from '../storage/conversationRepo';

const DEFAULT_CONVERSATION_TITLE = '新会话';
const FILE_CONVERSATION_TITLE = '文件对话';
const CONVERSATION_TITLE_MAX_LENGTH = 28;

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

export interface UseConversationsReturn {
  conversations: Conversation[];
  activeConversation: Conversation;
  persistenceVersion: number;
  deletedConversationIds: Set<string>;
  createNewConversation: () => void;
  switchToConversation: (id: string) => void;
  deleteConversationById: (id: string) => boolean;
  renameConversation: (id: string, title: string) => Promise<void>;
  updateActiveConversation: (conversation: Conversation) => void;
  setActiveConversationPersona: (personaId: string | undefined, systemPrompt: string | undefined) => void;
  saveConversationWithMessages: (messages: ChatMessage[]) => void;
  refreshConversations: (expectedPersistenceVersion?: number, preferStoredValues?: boolean) => Promise<void>;
  clearConversationList: () => void;
  startLocalReset: () => void;
  completeLocalReset: () => void;
  cancelLocalReset: () => void;
  setActiveConversation: (conversation: Conversation) => void;
}

export function useConversations(settings: AppSettings, onError: (message: string) => void): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation>(() => newConversation(settings.model));

  const activeConversationIdRef = useRef(activeConversation.id);
  const persistenceVersionRef = useRef(0);
  const isResettingRef = useRef(false);
  const resetCompletionRef = useRef<Promise<void> | null>(null);
  const resolveResetCompletionRef = useRef<(() => void) | null>(null);
  const deletedConversationIdsRef = useRef(new Set<string>());
  const latestConversationSnapshotsRef = useRef(new Map<string, Conversation>());
  const conversationSaveChainsRef = useRef(new Map<string, Promise<void>>());

  function updateActiveConversation(conversation: Conversation) {
    activeConversationIdRef.current = conversation.id;
    setActiveConversation(conversation);
  }

  function setActiveConversationPersona(personaId: string | undefined, systemPrompt: string | undefined) {
    const updated: Conversation = {
      ...activeConversation,
      personaId,
      systemPrompt,
      updatedAt: Date.now()
    };

    activeConversationIdRef.current = updated.id;
    setActiveConversation(updated);
    latestConversationSnapshotsRef.current.set(updated.id, updated);
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

  async function refreshConversations(expectedPersistenceVersion = persistenceVersionRef.current, preferStoredValues = false) {
    const storedConversations = await listConversations();

    if (isResettingRef.current || expectedPersistenceVersion !== persistenceVersionRef.current) {
      return;
    }

    const nextConversations = storedConversations.reduce<Conversation[]>((mergedConversations, storedConversation) => {
      if (deletedConversationIdsRef.current.has(storedConversation.id)) {
        latestConversationSnapshotsRef.current.delete(storedConversation.id);
        return mergedConversations;
      }

      const localConversation = preferStoredValues ? undefined : latestConversationSnapshotsRef.current.get(storedConversation.id);
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

  async function cleanupInvalidatedConversation(id: string) {
    deletedConversationIdsRef.current.add(id);
    latestConversationSnapshotsRef.current.delete(id);
    setConversations((current) => current.filter((conversation) => conversation.id !== id));

    try {
      await deleteConversation(id);
    } catch {
      onError('清理已失效会话失败，请重试。');
    }
  }

  function createNewConversation() {
    const conversation = newConversation(settings.model);
    updateActiveConversation(conversation);
  }

  function clearConversationList() {
    setConversations([]);
  }

  function startLocalReset() {
    startResetAttempt();
  }

  function completeLocalReset() {
    persistenceVersionRef.current += 1;
    finishResetAttempt();
  }

  function cancelLocalReset() {
    finishResetAttempt();
  }

  function switchToConversation(id: string) {
    if (deletedConversationIdsRef.current.has(id)) {
      return;
    }

    const selected = conversations.find((conversation) => conversation.id === id);
    if (selected && selected.id !== activeConversationIdRef.current) {
      updateActiveConversation(selected);
    }
  }

  function deleteConversationById(id: string) {
    if (deletedConversationIdsRef.current.has(id)) {
      return false;
    }

    const persistenceVersion = persistenceVersionRef.current;
    const wasActiveConversation = activeConversationIdRef.current === id;

    deletedConversationIdsRef.current.add(id);
    latestConversationSnapshotsRef.current.delete(id);
    setConversations((current) => current.filter((conversation) => conversation.id !== id));

    if (wasActiveConversation) {
      updateActiveConversation(newConversation(settings.model));
    }

    void deleteConversation(id)
      .then(async () => {
        conversationSaveChainsRef.current.delete(id);
        await refreshConversations(persistenceVersion);
      })
      .catch(async () => {
        deletedConversationIdsRef.current.delete(id);
        onError('删除会话失败，请重试。');
        await refreshConversations(persistenceVersion).catch(() => {});
      });

    return wasActiveConversation;
  }

  async function renameConversation(id: string, title: string) {
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
        onError(error instanceof Error ? error.message : '重命名会话失败。');
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

  function saveConversationWithMessages(messages: ChatMessage[]) {
    const latestConversation = latestConversationSnapshotsRef.current.get(activeConversation.id) ?? activeConversation;
    const conversation = withDerivedConversationTitle({
      ...activeConversation,
      ...latestConversation,
      messages,
      model: settings.model,
      updatedAt: Date.now()
    });

    if (messages.length > 0) {
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
            onError(error instanceof Error ? error.message : '保存会话失败。');
          }
      });
    }
  }

  useEffect(() => {
    refreshConversations();
  }, []);

  return {
    conversations,
    activeConversation,
    persistenceVersion: persistenceVersionRef.current,
    deletedConversationIds: deletedConversationIdsRef.current,
    createNewConversation,
    switchToConversation,
    deleteConversationById,
    renameConversation,
    updateActiveConversation,
    saveConversationWithMessages,
    refreshConversations,
    clearConversationList,
    startLocalReset,
    completeLocalReset,
    cancelLocalReset,
    setActiveConversation,
    setActiveConversationPersona
  };
}
