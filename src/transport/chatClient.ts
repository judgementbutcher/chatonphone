import type { AppSettings, OpenAIChatRequest } from '../domain/types';
import { getActiveProviderSettings } from '../settings/settingsStore';

export type FetchLike = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeApiBaseUrl(baseUrl: string): string {
  const trimmed = trimTrailingSlash(baseUrl);

  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const endpointSuffixes = ['/chat/completions', '/models'];
    let pathname = url.pathname.replace(/\/+$/, '');

    for (const suffix of endpointSuffixes) {
      if (pathname.endsWith(suffix)) {
        pathname = pathname.slice(0, -suffix.length);
        break;
      }
    }

    if (!pathname || pathname === '/') {
      url.pathname = '/v1';
      return trimTrailingSlash(url.toString());
    }

    url.pathname = pathname;
    return trimTrailingSlash(url.toString());
  } catch {
    return trimmed;
  }
}

function joinEndpoint(baseUrl: string, path: string): string {
  const base = trimTrailingSlash(baseUrl);

  if (!base) {
    return path;
  }

  if (base.endsWith(path)) {
    return base;
  }

  if (path.startsWith('/v1/') && base.endsWith('/v1')) {
    return `${base}${path.slice('/v1'.length)}`;
  }

  return `${base}${path}`;
}

function buildUrl(settings: AppSettings): string {
  const activeSettings = getActiveProviderSettings(settings);

  if (activeSettings.requestMode === 'proxy') {
    return joinEndpoint(activeSettings.proxyUrl, '/v1/chat/completions');
  }

  return joinEndpoint(normalizeApiBaseUrl(activeSettings.apiBaseUrl), '/chat/completions');
}

function buildModelsUrl(settings: AppSettings): string {
  const activeSettings = getActiveProviderSettings(settings);

  return joinEndpoint(activeSettings.proxyUrl, '/v1/models');
}

function buildHeaders(settings: AppSettings): HeadersInit {
  const activeSettings = getActiveProviderSettings(settings);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${activeSettings.apiKey}`,
    'Content-Type': 'application/json'
  };

  if (activeSettings.requestMode === 'proxy') {
    headers['X-Target-Base-URL'] = normalizeApiBaseUrl(activeSettings.apiBaseUrl);

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
    'X-Target-Base-URL': normalizeApiBaseUrl(activeSettings.apiBaseUrl)
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

  const data = await response.json() as unknown;

  return extractModelIds(data);
}

export async function readNonStreamingText(response: Response): Promise<string> {
  const data = await response.json() as unknown;

  if (isRecord(data)) {
    const outputText = textFromContent(data.output_text);

    if (outputText) {
      return outputText;
    }

    if (Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        const text = textFromChoice(choice);

        if (text) {
          return text;
        }
      }
    }

    return textFromContent(data.content);
  }

  return '';
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

    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      continue;
    }

    for (const choice of parsed.choices) {
      const text = textFromStreamingChoice(choice);

      if (text) {
        chunks.push(text);
      }
    }
  }

  return { done: false, chunks };
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content.map((part) => {
    if (typeof part === 'string') {
      return part;
    }

    if (!isRecord(part)) {
      return '';
    }

    return textFromContent(part.text) || textFromContent(part.content);
  }).join('');
}

function textFromChoice(choice: unknown): string {
  if (!isRecord(choice)) {
    return '';
  }

  if (isRecord(choice.message)) {
    return (
      textFromContent(choice.message.content) ||
      textFromContent(choice.message.reasoning_content)
    );
  }

  return textFromContent(choice.text);
}

function textFromStreamingChoice(choice: unknown): string {
  if (!isRecord(choice)) {
    return '';
  }

  if (isRecord(choice.delta)) {
    return (
      textFromContent(choice.delta.content) ||
      textFromContent(choice.delta.reasoning_content)
    );
  }

  return textFromChoice(choice);
}

function modelIdFrom(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (!isRecord(value)) {
    return '';
  }

  return textFromContent(value.id) || textFromContent(value.name) || textFromContent(value.model);
}

function modelIdsFromArray(values: unknown[]): string[] {
  return [...new Set(values.map(modelIdFrom).filter(Boolean))];
}

function extractModelIds(data: unknown): string[] {
  if (Array.isArray(data)) {
    return modelIdsFromArray(data);
  }

  if (!isRecord(data)) {
    return [];
  }

  if (Array.isArray(data.data)) {
    return modelIdsFromArray(data.data);
  }

  if (Array.isArray(data.models)) {
    return modelIdsFromArray(data.models);
  }

  if (isRecord(data.data) && Array.isArray(data.data.models)) {
    return modelIdsFromArray(data.data.models);
  }

  return [];
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
