import { useReducer, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { AppSettings, ChatMessage, Conversation } from '../domain/types';
import { chatReducer, initialChatState } from '../state/chatReducer';
import { classifyChatError } from '../domain/errors';
import { toOpenAIChatRequest } from '../domain/openaiAdapter';
import { fileToAttachment, validateFileBatch } from '../domain/imageProcessing';
import { readNonStreamingText, readStreamingText, sendChatRequest } from '../transport/chatClient';

interface ActiveGeneration {
  generationId: string;
  conversationId: string;
  controller: AbortController;
}

export interface UseChatGenerationReturn {
  state: ReturnType<typeof chatReducer>;
  dispatch: React.Dispatch<Parameters<typeof chatReducer>[1]>;
  sendMessage: (payload: { text: string; files: File[] }) => Promise<boolean | void>;
  stopGeneration: () => void;
  editUserMessage: (message: ChatMessage) => void;
  regenerateMessage: (message: ChatMessage) => Promise<void>;
  switchVersion: (messageId: string, versionIndex: number) => void;
  loadMessages: (messages: ChatMessage[]) => void;
}

export function useChatGeneration(
  settings: AppSettings,
  activeConversation: Conversation,
  persistenceVersion: number,
  deletedConversationIds: Set<string>
): UseChatGenerationReturn {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const activeGenerationRef = useRef<ActiveGeneration | null>(null);
  const activeConversationIdRef = useRef(activeConversation.id);
  const systemPromptRef = useRef(activeConversation.systemPrompt);

  // Update refs when conversation changes
  activeConversationIdRef.current = activeConversation.id;
  systemPromptRef.current = activeConversation.systemPrompt;

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

  function isSendContextStale(conversationId: string) {
    return deletedConversationIds.has(conversationId) || activeConversationIdRef.current !== conversationId;
  }

  async function generateAssistantResponse(
    generation: ActiveGeneration,
    assistantMessageId: string,
    messagesForRequest: ChatMessage[]
  ): Promise<boolean | void> {
    const controller = generation.controller;

    try {
      const request = toOpenAIChatRequest(messagesForRequest, settings, systemPromptRef.current);
      const response = await sendChatRequest(request, settings, fetch, controller.signal);

      if (!isActiveGeneration(generation)) {
        return false;
      }

      // 关键：以服务器实际返回的 Content-Type 为准，而不是请求时的 stream 标志。
      // 许多第三方中转站会忽略 stream:true，直接返回普通 JSON completion，
      // 此时若仍按流式解析会读不到任何 data: 行，导致回复永远为空。
      const contentType = response.headers.get('content-type') ?? '';
      const isEventStream = contentType.toLowerCase().includes('text/event-stream');

      let receivedContent = false;

      if (isEventStream) {
        for await (const delta of readStreamingText(response)) {
          if (!isActiveGeneration(generation)) {
            return false;
          }

          if (delta.length > 0) {
            receivedContent = true;
          }

          dispatch({ type: 'append-assistant-delta', messageId: assistantMessageId, delta });
        }
      } else {
        const text = await readNonStreamingText(response);

        if (!isActiveGeneration(generation)) {
          return false;
        }

        receivedContent = text.trim().length > 0;
        dispatch({ type: 'replace-assistant-text', messageId: assistantMessageId, text });
      }

      if (!isActiveGeneration(generation)) {
        return false;
      }

      // 服务器返回 200 但内容为空：移除空气泡并明确报错，避免永远停在「正在思考…」。
      if (!receivedContent) {
        dispatch({ type: 'remove-message', messageId: assistantMessageId });
        dispatch({
          type: 'set-error',
          message: '请求失败：接口返回了空回复，请检查模型名是否正确，或稍后重试。'
        });
        return false;
      }

      dispatch({ type: 'finish-generation' });
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

  async function sendMessage(payload: { text: string; files: File[] }): Promise<boolean | void> {
    const sendConversationId = activeConversationIdRef.current;

    if (isSendContextStale(sendConversationId)) {
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
      if (isSendContextStale(sendConversationId)) {
        return false;
      }

      dispatch({ type: 'set-error', message: error instanceof Error ? error.message : '文件处理失败。' });
      return false;
    }

    if (isSendContextStale(sendConversationId)) {
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
    dispatch({ type: 'finish-generation' });
    dispatch({ type: 'truncate-after-message', messageId: message.id });
  }

  async function regenerateMessage(message: ChatMessage) {
    const regenerationConversationId = activeConversationIdRef.current;

    if (message.role !== 'assistant' || isSendContextStale(regenerationConversationId)) {
      return;
    }

    const messageIndex = state.messages.findIndex((currentMessage) => currentMessage.id === message.id);

    if (messageIndex === -1) {
      return;
    }

    // Context is everything preceding this assistant message; the message being
    // regenerated (and anything after it) is excluded so the model re-answers
    // the same prior turn. For the common terminal case this is [.. , lastUser].
    const messagesForRequest = state.messages.slice(0, messageIndex);

    if (!messagesForRequest.some((currentMessage) => currentMessage.role === 'user')) {
      return;
    }

    const controller = new AbortController();
    const generation: ActiveGeneration = {
      generationId: nanoid(),
      conversationId: regenerationConversationId,
      controller
    };

    abortActiveGeneration();
    activeGenerationRef.current = generation;
    // Branch in place: keep the same message id, snapshot the prior answer into
    // its version list, and stream the fresh attempt into a new active slot.
    dispatch({ type: 'begin-regeneration', messageId: message.id });

    await generateAssistantResponse(generation, message.id, messagesForRequest);
  }

  function switchVersion(messageId: string, versionIndex: number) {
    dispatch({ type: 'switch-version', messageId, versionIndex });
  }

  function stopGeneration() {
    abortActiveGeneration();
    dispatch({ type: 'finish-generation' });
  }

  function loadMessages(messages: ChatMessage[]) {
    abortActiveGeneration();
    dispatch({ type: 'load-messages', messages });
  }

  return {
    state,
    dispatch,
    sendMessage,
    stopGeneration,
    editUserMessage,
    regenerateMessage,
    switchVersion,
    loadMessages
  };
}
