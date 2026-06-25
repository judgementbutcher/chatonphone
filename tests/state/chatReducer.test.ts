import { describe, expect, it } from 'vitest';
import { chatReducer, initialChatState } from '../../src/state/chatReducer';

describe('chatReducer', () => {
  it('adds user messages and empty assistant messages', () => {
    const state = chatReducer(initialChatState, {
      type: 'send-user-message',
      message: {
        id: 'u1',
        role: 'user',
        text: '你好',
        attachments: [],
        createdAt: 1
      },
      assistantMessageId: 'a1',
      now: 2
    });

    expect(state.messages).toMatchObject([
      { id: 'u1', role: 'user', text: '你好' },
      { id: 'a1', role: 'assistant', text: '' }
    ]);
    expect(state.isGenerating).toBe(true);
  });

  it('appends streaming deltas to the active assistant message', () => {
    const generating = chatReducer(initialChatState, {
      type: 'send-user-message',
      message: {
        id: 'u1',
        role: 'user',
        text: '你好',
        attachments: [],
        createdAt: 1
      },
      assistantMessageId: 'a1',
      now: 2
    });

    const state = chatReducer(generating, { type: 'append-assistant-delta', messageId: 'a1', delta: '你好' });

    expect(state.messages[1].text).toBe('你好');
  });

  it('stops generation and keeps partial output', () => {
    const generating = {
      ...initialChatState,
      isGenerating: true,
      activeAssistantMessageId: 'a1'
    };

    expect(chatReducer(generating, { type: 'finish-generation' })).toMatchObject({
      isGenerating: false,
      activeAssistantMessageId: null
    });
  });

  it('replaces assistant text', () => {
    const state = {
      ...initialChatState,
      messages: [
        { id: 'a1', role: 'assistant' as const, text: '', attachments: [], createdAt: 1 }
      ]
    };

    expect(chatReducer(state, { type: 'replace-assistant-text', messageId: 'a1', text: '完整回答' }).messages[0].text).toBe('完整回答');
  });

  it('sets errors and stops generation', () => {
    const generating = {
      ...initialChatState,
      isGenerating: true,
      activeAssistantMessageId: 'a1'
    };

    expect(chatReducer(generating, { type: 'set-error', message: '请求失败' })).toMatchObject({
      isGenerating: false,
      activeAssistantMessageId: null,
      error: '请求失败'
    });
  });

  it('loads messages and clears stale generation state', () => {
    const loadedMessages = [
      { id: 'u2', role: 'user' as const, text: '新会话', attachments: [], createdAt: 3 }
    ];
    const generating = {
      ...initialChatState,
      messages: [
        { id: 'a1', role: 'assistant' as const, text: '旧输出', attachments: [], createdAt: 1 }
      ],
      isGenerating: true,
      activeAssistantMessageId: 'a1',
      error: '旧错误'
    };

    expect(chatReducer(generating, { type: 'load-messages', messages: loadedMessages })).toEqual({
      messages: loadedMessages,
      isGenerating: false,
      activeAssistantMessageId: null,
      error: null
    });
  });

  it('truncates messages after an edited user message', () => {
    const state = {
      ...initialChatState,
      messages: [
        { id: 'u1', role: 'user' as const, text: '旧问题', attachments: [], createdAt: 1 },
        { id: 'a1', role: 'assistant' as const, text: '旧回答', attachments: [], createdAt: 2 }
      ]
    };

    expect(chatReducer(state, { type: 'truncate-after-message', messageId: 'u1' }).messages).toEqual([
      { id: 'u1', role: 'user', text: '旧问题', attachments: [], createdAt: 1 }
    ]);
  });

  it('removes an assistant message before regeneration', () => {
    const state = {
      ...initialChatState,
      messages: [
        { id: 'u1', role: 'user' as const, text: '问题', attachments: [], createdAt: 1 },
        { id: 'a1', role: 'assistant' as const, text: '回答', attachments: [], createdAt: 2 }
      ]
    };

    expect(chatReducer(state, { type: 'remove-message', messageId: 'a1' }).messages).toEqual([
      { id: 'u1', role: 'user', text: '问题', attachments: [], createdAt: 1 }
    ]);
  });

  it('begins an assistant message for regeneration', () => {
    const state = {
      ...initialChatState,
      messages: [
        { id: 'u1', role: 'user' as const, text: '问题', attachments: [], createdAt: 1 }
      ],
      error: '旧错误'
    };

    expect(chatReducer(state, { type: 'begin-assistant-message', messageId: 'a2', now: 3 })).toEqual({
      messages: [
        { id: 'u1', role: 'user', text: '问题', attachments: [], createdAt: 1 },
        { id: 'a2', role: 'assistant', text: '', attachments: [], createdAt: 3 }
      ],
      isGenerating: true,
      activeAssistantMessageId: 'a2',
      error: null
    });
  });

  it('deletes a message by id', () => {
    const state = {
      ...initialChatState,
      messages: [
        { id: 'u1', role: 'user' as const, text: '问题1', attachments: [], createdAt: 1 },
        { id: 'a1', role: 'assistant' as const, text: '回答1', attachments: [], createdAt: 2 },
        { id: 'u2', role: 'user' as const, text: '问题2', attachments: [], createdAt: 3 }
      ]
    };

    expect(chatReducer(state, { type: 'delete-message', messageId: 'a1' }).messages).toEqual([
      { id: 'u1', role: 'user', text: '问题1', attachments: [], createdAt: 1 },
      { id: 'u2', role: 'user', text: '问题2', attachments: [], createdAt: 3 }
    ]);
  });

  it('updates message content and clears attachments', () => {
    const state = {
      ...initialChatState,
      messages: [
        {
          id: 'u1',
          role: 'user' as const,
          text: '旧内容',
          attachments: [
            {
              id: 'img1',
              name: 'test.jpg',
              mimeType: 'image/jpeg',
              dataUrl: 'data:image/jpeg;base64,abc',
              previewUrl: 'blob:xyz',
              width: 100,
              height: 100,
              sizeBytes: 1000
            }
          ],
          createdAt: 1
        }
      ]
    };

    const updated = chatReducer(state, { type: 'update-message-content', messageId: 'u1', text: '新内容' });

    expect(updated.messages[0].text).toBe('新内容');
    expect(updated.messages[0].attachments).toEqual([]);
  });
});
