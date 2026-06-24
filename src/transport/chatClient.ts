import type { AppSettings, OpenAIChatRequest } from '../domain/types';
import { getActiveProviderSettings } from '../settings/settingsStore';

export type FetchLike = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildUrl(settings: AppSettings): string {
  const activeSettings = getActiveProviderSettings(settings);

  if (activeSettings.requestMode === 'proxy') {
    return `${trimTrailingSlash(activeSettings.proxyUrl)}/v1/chat/completions`;
  }

  return `${trimTrailingSlash(activeSettings.apiBaseUrl)}/chat/completions`;
}

function buildModelsUrl(settings: AppSettings): string {
  const activeSettings = getActiveProviderSettings(settings);

  return `${trimTrailingSlash(activeSettings.proxyUrl)}/v1/models`;
}

function buildHeaders(settings: AppSettings): HeadersInit {
  const activeSettings = getActiveProviderSettings(settings);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${activeSettings.apiKey}`,
    'Content-Type': 'application/json'
  };

  if (activeSettings.requestMode === 'proxy') {
    headers['X-Target-Base-URL'] = trimTrailingSlash(activeSettings.apiBaseUrl);

    const proxyAccessToken = activeSettings.proxyAccessToken.trim();

    if (proxyAccessToken.length > 0) {
      headers['X-Proxy-Access-Token'] = proxyAccessToken;
    }
  }

  return headers;
}

function buildModelHeaders(settings: AppSettings): HeadersInit {
  const activeSettings = getActiveProviderSettings(settings);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${activeSettings.apiKey}`,
    'Content-Type': 'application/json',
    'X-Target-Base-URL': trimTrailingSlash(activeSettings.apiBaseUrl)
  };
  const proxyAccessToken = activeSettings.proxyAccessToken.trim();

  if (proxyAccessToken.length > 0) {
    headers['X-Proxy-Access-Token'] = proxyAccessToken;
  }

  return headers;
}

export async function sendChatRequest(
  request: OpenAIChatRequest,
  settings: AppSettings,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetchImpl(buildUrl(settings), {
    method: 'POST',
    headers: buildHeaders(settings),
    body: JSON.stringify(request),
    signal
  });

  if (!response.ok) {
    throw response;
  }

  return response;
}

export async function fetchModelList(settings: AppSettings, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const response = await fetchImpl(buildModelsUrl(settings), {
    method: 'GET',
    headers: buildModelHeaders(settings)
  });

  if (!response.ok) {
    throw response;
  }

  const data = await response.json() as { data?: Array<{ id?: unknown }> };

  return [...new Set((data.data ?? [])
    .map((model) => (typeof model.id === 'string' ? model.id.trim() : ''))
    .filter(Boolean))];
}

export async function readNonStreamingText(response: Response): Promise<string> {
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

function takeSseEvents(buffer: string, flush = false): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';

  if (flush && rest.trim().length > 0) {
    parts.push(rest);
    return { events: parts, rest: '' };
  }

  return { events: parts, rest };
}

function parseStreamingEvent(event: string): { done: true } | { done: false; chunks: string[] } {
  const chunks: string[] = [];

  for (const line of event.split(/\r?\n/)) {
    if (!line.startsWith('data:')) {
      continue;
    }

    const payload = line.slice(5).trim();

    if (payload === '[DONE]') {
      return { done: true };
    }

    const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
    const text = parsed.choices?.[0]?.delta?.content;

    if (text) {
      chunks.push(text);
    }
  }

  return { done: false, chunks };
}

export async function* readStreamingText(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
      } else {
        buffer += decoder.decode(value, { stream: true });
      }

      const { events, rest } = takeSseEvents(buffer, done);
      buffer = rest;

      for (const event of events) {
        const parsed = parseStreamingEvent(event);

        if (parsed.done) {
          return;
        }

        for (const chunk of parsed.chunks) {
          yield chunk;
        }
      }

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
