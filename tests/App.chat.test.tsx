import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { defaultSettings, saveSettings } from '../src/settings/settingsStore';
import { resetLocalData } from '../src/storage/conversationRepo';

function streamingTextResponse(chunks: string[]): Response {
  return new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(chunk)}}}]}\n\n`));
      }

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  }), { status: 200 });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function flushAsyncWork() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function saveAuthenticatedSettings() {
  saveSettings({
    ...defaultSettings,
    syncAccount: {
      endpoint: '',
      accountId: 'desktop-user',
      accessToken: 'saved-token',
      autoSync: false
    }
  });
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: '打开设置' }).at(-1)!);
}

async function configureProvider(user: ReturnType<typeof userEvent.setup>) {
  await openSettings(user);
  await user.type(screen.getByLabelText('API Base URL'), 'https://gateway.example.com/v1');
  await user.type(screen.getByLabelText('API Key'), 'secret');
  await user.click(screen.getByRole('button', { name: '拉取模型列表' }));
  await waitFor(() => expect(screen.getByLabelText('模型名')).toHaveValue('vision-model'));
  await user.click(screen.getByRole('button', { name: '保存设置' }));
}

describe('App chat request flow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetLocalData();
    saveAuthenticatedSettings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends a configured chat request and renders the answer', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'vision-model' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(streamingTextResponse(['收', '到']));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await configureProvider(user);
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(screen.getByText('收到')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toBe('/v1/chat/completions');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer secret',
      'X-Target-Base-URL': 'https://gateway.example.com/v1'
    });
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: 'vision-model',
      stream: true,
      messages: [
        {
          role: 'user',
          content: '你好'
        }
      ]
    });
  });

  it('ignores completion from an old request after a newer conversation starts generating', async () => {
    const user = userEvent.setup();
    const firstRequest = deferredResponse();
    const secondRequest = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'vision-model' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await configureProvider(user);

    await user.type(screen.getByLabelText('消息内容'), 'first request');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '新会话' })[0]);
    await user.clear(screen.getByLabelText('消息内容'));
    await user.type(screen.getByLabelText('消息内容'), 'second request');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    await act(async () => {
      firstRequest.resolve(streamingTextResponse(['old answer']));
      await flushAsyncWork();
    });

    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
    expect((fetchMock.mock.calls[2][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(screen.queryByText('old answer')).not.toBeInTheDocument();

    await act(async () => {
      secondRequest.resolve(streamingTextResponse(['new answer']));
      await flushAsyncWork();
    });
    await waitFor(() => expect(screen.getByText('new answer')).toBeInTheDocument());
  });

  it('keeps generation active when reselecting the active conversation', async () => {
    const user = userEvent.setup();
    const request = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'vision-model' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockImplementationOnce(() => request.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await configureProvider(user);

    await user.type(screen.getByLabelText('消息内容'), 'still active');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();

    const activeConversationButton = await screen.findByRole('button', { name: 'still active' });

    expect(activeConversationButton).toHaveAttribute('aria-current', 'true');
    await user.click(activeConversationButton);

    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发送' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[2][1]?.signal as AbortSignal).aborted).toBe(false);

    await act(async () => {
      request.resolve(streamingTextResponse(['active answer']));
      await flushAsyncWork();
    });

    await waitFor(() => expect(screen.getByText('active answer')).toBeInTheDocument());
  });

  it('keeps an edited draft when the original generation finishes after the edit', async () => {
    const user = userEvent.setup();
    const request = deferredResponse();
    const fetchMock = vi.fn().mockImplementationOnce(() => request.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), 'draft to edit');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /^编辑消息 / }));
    await waitFor(() => expect(screen.getByLabelText('消息内容')).toHaveValue('draft to edit'));

    await act(async () => {
      request.resolve(streamingTextResponse(['late answer']));
      await flushAsyncWork();
    });

    await waitFor(() => expect(screen.getByLabelText('消息内容')).toHaveValue('draft to edit'));
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(screen.queryByText('late answer')).not.toBeInTheDocument();
  });

  it('does not offer regeneration when a later edited user message is terminal', async () => {
    const user = userEvent.setup();
    const secondRequest = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamingTextResponse(['first answer']))
      .mockImplementationOnce(() => secondRequest.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), 'first question');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(screen.getByText('first answer')).toBeInTheDocument());

    await user.type(screen.getByLabelText('消息内容'), 'second question');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const editButtons = screen.getAllByRole('button', { name: /^编辑消息 / });
    await user.click(editButtons[editButtons.length - 1]);

    await waitFor(() => expect(screen.getByLabelText('消息内容')).toHaveValue('second question'));
    expect(screen.queryByRole('button', { name: '重新生成' })).not.toBeInTheDocument();
    expect((fetchMock.mock.calls[1][1]?.signal as AbortSignal).aborted).toBe(true);

    await act(async () => {
      secondRequest.resolve(streamingTextResponse(['late second answer']));
      await flushAsyncWork();
    });

    await waitFor(() => expect(screen.getByLabelText('消息内容')).toHaveValue('second question'));
    expect(screen.queryByText('late second answer')).not.toBeInTheDocument();
  });

  it('regenerates the terminal assistant with the prior multi-turn context', async () => {
    const user = userEvent.setup();
    const regenerationRequest = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamingTextResponse(['first answer']))
      .mockResolvedValueOnce(streamingTextResponse(['second answer']))
      .mockImplementationOnce(() => regenerationRequest.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), 'first question');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(screen.getByText('first answer')).toBeInTheDocument());

    await user.type(screen.getByLabelText('消息内容'), 'second question');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(screen.getByText('second answer')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '重新生成' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string).messages).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'second question' }
    ]);

    await act(async () => {
      regenerationRequest.resolve(streamingTextResponse(['second answer regenerated']));
      await flushAsyncWork();
    });

    await waitFor(() => expect(screen.getByText('second answer regenerated')).toBeInTheDocument());
  });
});
