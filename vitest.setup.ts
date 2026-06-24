import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';

function buildDefaultFetchResponse(signal?: AbortSignal) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        controller.close();
        return;
      }

      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();

      signal?.addEventListener('abort', () => {
        try {
          controller.close();
        } catch {
          // The default successful stream may already be closed.
        }
      }, { once: true });
    }
  });

  return new Response(stream, { status: 200 });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((_input, init?: RequestInit) => {
    return Promise.resolve(buildDefaultFetchResponse(init?.signal ?? undefined));
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
