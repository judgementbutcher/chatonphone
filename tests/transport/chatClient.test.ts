import { describe, expect, it, vi } from 'vitest';
import { fetchModelList, readNonStreamingText, readStreamingText, sendChatRequest } from '../../src/transport/chatClient';
import type { AppSettings, OpenAIChatRequest } from '../../src/domain/types';

const request: OpenAIChatRequest = {
  model: 'vision-model',
  messages: [{ role: 'user', content: 'hi' }],
  temperature: 0.7,
  max_tokens: 2048,
  stream: false
};

const baseSettings: AppSettings = {
  apiBaseUrl: 'https://gateway.example.com/v1',
  apiKey: 'secret',
  model: 'vision-model',
  temperature: 0.7,
  maxTokens: 2048,
  stream: false,
  requestMode: 'direct',
  proxyUrl: '',
  proxyAccessToken: ''
};

describe('sendChatRequest', () => {
  it('uses same-origin proxy endpoints by default', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await sendChatRequest(request, {
      ...baseSettings,
      requestMode: 'proxy',
      proxyUrl: ''
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'X-Target-Base-URL': 'https://gateway.example.com/v1'
      })
    }));
  });

  it('sends direct OpenAI-compatible requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }));

    await sendChatRequest(request, baseSettings, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://gateway.example.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json'
      })
    }));
  });

  it('sends proxy requests with target headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await sendChatRequest(request, {
      ...baseSettings,
      requestMode: 'proxy',
      proxyUrl: 'https://proxy.example.com'
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://proxy.example.com/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'Content-Type': 'application/json',
        'X-Target-Base-URL': 'https://gateway.example.com/v1'
      })
    }));
  });

  it('uses the selected provider credentials and proxy settings', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await sendChatRequest(request, {
      ...baseSettings,
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
          proxyAccessToken: ' edge-token ',
          models: ['anthropic/claude-3.5-sonnet']
        }
      ]
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://proxy.example.com/v1/chat/completions', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer openrouter-secret',
        'X-Target-Base-URL': 'https://openrouter.ai/api/v1',
        'X-Proxy-Access-Token': 'edge-token'
      })
    }));
  });

  it('trims proxy access tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    await sendChatRequest(request, {
      ...baseSettings,
      requestMode: 'proxy',
      proxyUrl: 'https://proxy.example.com',
      proxyAccessToken: '  proxy-secret  '
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: expect.objectContaining({
        'X-Proxy-Access-Token': 'proxy-secret'
      })
    }));
  });

  it('throws unsuccessful responses for classification by the UI', async () => {
    const response = new Response('Unauthorized', { status: 401 });
    const fetchImpl = vi.fn().mockResolvedValue(response);

    await expect(sendChatRequest(request, baseSettings, fetchImpl)).rejects.toBe(response);
  });

  it('passes abort signals to fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const controller = new AbortController();

    await sendChatRequest(request, baseSettings, fetchImpl, controller.signal);

    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      signal: controller.signal
    }));
  });
});

describe('fetchModelList', () => {
  it('loads models through the same-origin proxy using base url and api key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'gpt-4o-mini' },
        { id: 'anthropic/claude-3.5-sonnet' }
      ]
    }), { status: 200 }));

    await expect(fetchModelList(baseSettings, fetchImpl)).resolves.toEqual([
      'gpt-4o-mini',
      'anthropic/claude-3.5-sonnet'
    ]);
    expect(fetchImpl).toHaveBeenCalledWith('/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'X-Target-Base-URL': 'https://gateway.example.com/v1'
      })
    }));
  });

  it('throws unsuccessful model list responses', async () => {
    const response = new Response('Unauthorized', { status: 401 });
    const fetchImpl = vi.fn().mockResolvedValue(response);

    await expect(fetchModelList(baseSettings, fetchImpl)).rejects.toBe(response);
  });
});

describe('readNonStreamingText', () => {
  it('extracts assistant message content', async () => {
    await expect(readNonStreamingText(new Response(JSON.stringify({
      choices: [{ message: { content: 'ok' } }]
    })))).resolves.toBe('ok');
  });

  it('falls back to empty text when content is missing', async () => {
    await expect(readNonStreamingText(new Response(JSON.stringify({ choices: [] })))).resolves.toBe('');
  });
});

it('reads OpenAI-style streaming deltas', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\n'));
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"好"}}]}\n\n'));
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    }
  });

  const chunks: string[] = [];

  for await (const chunk of readStreamingText(new Response(stream))) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual(['你', '好']);
});

it('reads streaming deltas with CRLF boundaries and final buffered events', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"边"}}]}\r\n\r\n'));
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"界"}}]}'));
      controller.close();
    }
  });

  const chunks: string[] = [];

  for await (const chunk of readStreamingText(new Response(stream))) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual(['边', '界']);
});
