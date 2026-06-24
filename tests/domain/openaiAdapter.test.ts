import { describe, expect, it } from 'vitest';
import { toOpenAIChatRequest } from '../../src/domain/openaiAdapter';
import type { AppSettings, ChatMessage } from '../../src/domain/types';

const settings: AppSettings = {
  apiBaseUrl: 'https://gateway.example.com/v1',
  apiKey: 'secret-key',
  model: 'vision-model',
  temperature: 0.3,
  maxTokens: 1024,
  stream: true,
  requestMode: 'direct',
  proxyUrl: '',
  proxyAccessToken: ''
};

describe('toOpenAIChatRequest', () => {
  it('converts text-only messages', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        role: 'user',
        text: '你好',
        attachments: [],
        createdAt: 1
      }
    ];

    expect(toOpenAIChatRequest(messages, settings)).toEqual({
      model: 'vision-model',
      temperature: 0.3,
      max_tokens: 1024,
      stream: true,
      messages: [
        {
          role: 'user',
          content: '你好'
        }
      ]
    });
  });

  it('uses the selected provider model when multiple providers are configured', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        role: 'user',
        text: '你好',
        attachments: [],
        createdAt: 1
      }
    ];

    expect(toOpenAIChatRequest(messages, {
      ...settings,
      model: 'legacy-model',
      selectedProviderId: 'openrouter',
      selectedModel: 'anthropic/claude-3.5-sonnet',
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          apiBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'openai-secret',
          requestMode: 'direct',
          proxyUrl: '',
          proxyAccessToken: '',
          models: ['gpt-4o-mini']
        },
        {
          id: 'openrouter',
          name: 'OpenRouter',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-secret',
          requestMode: 'proxy',
          proxyUrl: 'https://proxy.example.com',
          proxyAccessToken: 'proxy-secret',
          models: ['anthropic/claude-3.5-sonnet']
        }
      ]
    }).model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('converts image attachments to OpenAI content parts', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        role: 'user',
        text: '分析图片',
        attachments: [
          {
            id: 'a1',
            kind: 'image',
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,abcd',
            previewUrl: 'data:image/jpeg;base64,preview',
            width: 800,
            height: 600,
            sizeBytes: 1234
          }
        ],
        createdAt: 1
      }
    ];

    expect(toOpenAIChatRequest(messages, settings).messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '分析图片' },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,abcd'
          }
        }
      ]
    });
  });

  it('adds text file attachments to the user content text', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        role: 'user',
        text: '总结这个文件',
        attachments: [
          {
            id: 'a1',
            kind: 'text',
            name: 'notes.md',
            mimeType: 'text/markdown',
            text: '# Notes\nUse this context.',
            sizeBytes: 24
          }
        ],
        createdAt: 1
      }
    ];

    expect(toOpenAIChatRequest(messages, settings).messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: '总结这个文件\n\n[File: notes.md]\n# Notes\nUse this context.'
        }
      ]
    });
  });

  it('keeps non-user messages as text even if attachments are present', () => {
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        text: '图片说明',
        attachments: [
          {
            id: 'a1',
            kind: 'image',
            name: 'photo.jpg',
            mimeType: 'image/jpeg',
            dataUrl: 'data:image/jpeg;base64,abcd',
            previewUrl: 'data:image/jpeg;base64,preview',
            width: 800,
            height: 600,
            sizeBytes: 1234
          }
        ],
        createdAt: 1
      }
    ];

    expect(toOpenAIChatRequest(messages, settings).messages[0]).toEqual({
      role: 'assistant',
      content: '图片说明'
    });
  });
});
