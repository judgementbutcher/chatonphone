import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import type { AppSettings } from '../src/domain/types';
import { defaultSettings, saveSettings } from '../src/settings/settingsStore';
import { resetLocalData } from '../src/storage/conversationRepo';

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

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
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

function authenticatedSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...overrides,
    syncAccount: {
      endpoint: '',
      accountId: 'desktop-user',
      accessToken: 'saved-token',
      autoSync: false,
      ...overrides.syncAccount
    }
  };
}

function saveAuthenticatedSettings(overrides: Partial<AppSettings> = {}) {
  saveSettings(authenticatedSettings(overrides));
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: '打开设置' }).at(-1)!);
  await screen.findByLabelText('API Base URL');
}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetLocalData();
    saveAuthenticatedSettings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires visitors to register or log in before using chat', () => {
    localStorage.clear();

    render(<App />);

    expect(screen.getByRole('heading', { name: 'ChatOnPhone' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '登录或注册' })).toBeInTheDocument();
    expect(screen.getByLabelText('账号')).toBeInTheDocument();
    expect(screen.getByLabelText('登录密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.queryByLabelText('消息内容')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新会话' })).not.toBeInTheDocument();
  });

  it('registers from the auth screen and enters the chat app', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accountId: 'desktop-user',
        accessToken: 'registered-token'
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();

    render(<App />);

    await user.type(screen.getByLabelText('账号'), 'desktop-user');
    await user.type(screen.getByLabelText('登录密码'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => expect(screen.getByLabelText('消息内容')).toBeInTheDocument());
    expect(fetchMock.mock.calls[0][0]).toBe('/auth/register');
    expect(fetchMock.mock.calls[1][0]).toBe('/sync/settings/desktop-user');
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer registered-token'
    });
  });

  it('logs in from the auth screen, downloads settings, and enters the chat app', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accountId: 'desktop-user',
        accessToken: 'login-token'
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'synced-model',
          temperature: 0.7,
          maxTokens: 2048,
          stream: true,
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'openrouter-secret',
              requestMode: 'direct',
              proxyUrl: '',
              proxyAccessToken: '',
              models: ['synced-model']
            }
          ],
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: '',
            autoSync: true
          }
        }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();

    render(<App />);

    await user.type(screen.getByLabelText('账号'), 'desktop-user');
    await user.type(screen.getByLabelText('登录密码'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(screen.getByLabelText('消息内容')).toBeInTheDocument());
    await openSettings(user);
    expect(screen.getByLabelText('API Base URL')).toHaveValue('https://openrouter.ai/api/v1');
    expect(screen.getByLabelText('默认聊天模型')).toHaveValue('synced-model');
    expect(fetchMock.mock.calls[0][0]).toBe('/auth/login');
    expect(fetchMock.mock.calls[1][0]).toBe('/sync/settings/desktop-user');
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: 'Bearer login-token'
    });
  });

  it('renders the product shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'ChatOnPhone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新会话' })).toBeInTheDocument();
  });

  it('shows validation errors from image selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByLabelText('选择文件'), {
      target: {
        files: [
          imageFile('1.jpg'),
          imageFile('2.jpg'),
          imageFile('3.jpg'),
          imageFile('4.jpg'),
          imageFile('5.jpg'),
          imageFile('6.jpg'),
          imageFile('7.jpg')
        ]
      }
    });
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getByRole('alert')).toHaveTextContent('一次最多选择 6 个文件。');
  });

  it('clears visible messages after local data reset', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getAllByText('你好').length).toBeGreaterThan(0);

    await openSettings(user);
    await user.click(screen.getByRole('button', { name: '清除本机数据' }));
    await user.click(screen.getAllByRole('button', { name: '清除本机数据' }).at(-1)!);

    await waitFor(() => {
      expect(screen.queryByText('你好')).not.toBeInTheDocument();
    });
  });

  it('does not expose login or register actions from the settings sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openSettings(user);

    expect(screen.getByText('当前账号')).toBeInTheDocument();
    expect(screen.getByText('desktop-user')).toBeInTheDocument();
    expect(screen.queryByLabelText('登录密码')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '注册账号' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登录账号' })).not.toBeInTheDocument();
  });

  it('keeps settings out of the active chat view until opened', () => {
    render(<App />);

    expect(screen.queryByLabelText('API Base URL')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存设置' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('消息内容')).toBeInTheDocument();
  });

  it('uploads provider changes whenever a logged-in account saves settings', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('chatonphone.settings.v1', JSON.stringify({
      apiBaseUrl: '',
      apiKey: '',
      model: '',
      temperature: 0.7,
      maxTokens: 2048,
      stream: true,
      requestMode: 'proxy',
      proxyUrl: '',
      proxyAccessToken: '',
      providers: [
        {
          id: 'default',
          name: '默认供应商',
          apiBaseUrl: '',
          apiKey: '',
          requestMode: 'proxy',
          proxyUrl: '',
          proxyAccessToken: '',
          models: []
        }
      ],
      selectedProviderId: 'default',
      selectedModel: '',
      syncAccount: {
        endpoint: '',
        accountId: 'desktop-user',
        accessToken: 'saved-token',
        autoSync: false
      }
    }));

    render(<App />);

    await openSettings(user);
    await user.clear(screen.getByLabelText('API Base URL'));
    await user.type(screen.getByLabelText('API Base URL'), 'https://openrouter.ai/api/v1');
    await user.clear(screen.getByLabelText('API Key'));
    await user.type(screen.getByLabelText('API Key'), 'openrouter-secret');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/sync/settings/desktop-user', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: 'Bearer saved-token'
      })
    })));
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).settings.providers[0]).toMatchObject({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret'
    });
  });

  it('does not upload sync settings when only local preferences change', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await openSettings(user);
    await user.click(screen.getByLabelText('暗色模式'));
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads account settings on startup for an authenticated account', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      settings: {
        selectedProviderId: 'openrouter',
        selectedModel: 'remote-model',
        temperature: 0.7,
        maxTokens: 2048,
        stream: true,
        providers: [
          {
            id: 'openrouter',
            name: 'OpenRouter',
            apiBaseUrl: 'https://openrouter.ai/api/v1',
            apiKey: 'remote-secret',
            requestMode: 'proxy',
            proxyUrl: '',
            proxyAccessToken: '',
            models: ['remote-model']
          }
        ],
        syncAccount: {
          endpoint: '',
          accountId: 'desktop-user',
          accessToken: '',
          autoSync: true
        }
      }
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    saveAuthenticatedSettings({
      syncAccount: {
        endpoint: '',
        accountId: 'desktop-user',
        accessToken: 'saved-token',
        autoSync: true
      }
    });

    render(<App />);

    await openSettings(userEvent.setup());
    await waitFor(() => expect(screen.getByLabelText('API Base URL')).toHaveValue('https://openrouter.ai/api/v1'));
    expect(screen.getByLabelText('默认聊天模型')).toHaveValue('remote-model');
    expect(fetchMock).toHaveBeenCalledWith('/sync/settings/desktop-user', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer saved-token'
      })
    }));
  });

  it('downloads account settings again when the app returns to the foreground', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'startup-model',
          temperature: 0.7,
          maxTokens: 2048,
          stream: true,
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'startup-secret',
              requestMode: 'proxy',
              proxyUrl: '',
              proxyAccessToken: '',
              models: ['startup-model']
            }
          ],
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: '',
            autoSync: true
          }
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'resume-model',
          temperature: 0.7,
          maxTokens: 2048,
          stream: true,
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'resume-secret',
              requestMode: 'proxy',
              proxyUrl: '',
              proxyAccessToken: '',
              models: ['resume-model']
            }
          ],
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: '',
            autoSync: true
          }
        }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    saveAuthenticatedSettings({
      syncAccount: {
        endpoint: '',
        accountId: 'desktop-user',
        accessToken: 'saved-token',
        autoSync: true
      }
    });

    render(<App />);

    await openSettings(userEvent.setup());
    await waitFor(() => expect(screen.getByLabelText('默认聊天模型')).toHaveValue('startup-model'));

    nowSpy.mockReturnValue(7000);
    fireEvent.focus(window);

    await waitFor(() => expect(screen.getByLabelText('默认聊天模型')).toHaveValue('resume-model'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the latest chat model when resume sync runs after switching models', async () => {
    const user = userEvent.setup();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'setup-model',
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'remote-secret',
              requestMode: 'proxy',
              proxyUrl: '',
              proxyAccessToken: '',
              models: ['setup-model', 'chat-model']
            }
          ],
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: '',
            autoSync: true
          }
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'setup-model',
          providers: [
            {
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'remote-secret',
              requestMode: 'proxy',
              proxyUrl: '',
              proxyAccessToken: '',
              models: ['setup-model', 'chat-model']
            }
          ],
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: '',
            autoSync: true
          }
        }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    saveAuthenticatedSettings({
      syncAccount: {
        endpoint: '',
        accountId: 'desktop-user',
        accessToken: 'saved-token',
        autoSync: true
      }
    });

    render(<App />);

    await waitFor(() => expect(screen.getByLabelText('桌面模型选择')).toHaveValue('setup-model'));
    await user.selectOptions(screen.getByLabelText('桌面模型选择'), 'chat-model');
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('chatonphone.settings.v1') ?? '{}')).toMatchObject({
        model: 'chat-model',
        chatModel: 'chat-model',
        selectedModel: 'setup-model'
      });
    });

    nowSpy.mockReturnValue(7000);
    fireEvent.focus(window);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('桌面模型选择')).toHaveValue('chat-model');
    expect(JSON.parse(localStorage.getItem('chatonphone.settings.v1') ?? '{}')).toMatchObject({
      model: 'chat-model',
      chatModel: 'chat-model',
      selectedModel: 'setup-model'
    });
  });

  it('tests a manually configured provider through the chat endpoint', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'OK' } }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await openSettings(user);
    await user.type(screen.getByLabelText('API Base URL'), 'https://gateway.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'secret');
    await user.type(screen.getByLabelText('默认聊天模型'), 'manual-model');
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret',
        'X-Target-Base-URL': 'https://gateway.example.com/v1'
      })
    })));
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      model: 'manual-model',
      stream: false,
      max_tokens: 16
    });
    expect(await screen.findByText('测试通过，供应商可用。')).toBeInTheDocument();
  });

  it('downloads account settings and uses the synced provider for chat', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accountId: 'desktop-user',
        accessToken: 'login-token'
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        settings: {
          selectedProviderId: 'openrouter',
          selectedModel: 'anthropic/claude-3.5-sonnet',
          temperature: 0.7,
          maxTokens: 2048,
          stream: true,
          providers: [
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
          ],
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: '',
            autoSync: true
          }
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(streamingTextResponse(['同步完成']));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
    render(<App />);

    await user.type(screen.getByLabelText('账号'), 'desktop-user');
    await user.type(screen.getByLabelText('登录密码'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await openSettings(user);
    await waitFor(() => expect(screen.getByLabelText('API Base URL')).toHaveValue('https://openrouter.ai/api/v1'));
    await user.click(screen.getByRole('button', { name: '关闭设置' }));

    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => expect(screen.getByText('同步完成')).toBeInTheDocument());

    expect(fetchMock.mock.calls[2][0]).toBe('https://proxy.example.com/v1/chat/completions');
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer openrouter-secret',
      'X-Target-Base-URL': 'https://openrouter.ai/api/v1',
      'X-Proxy-Access-Token': 'proxy-secret'
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toMatchObject({
      model: 'anthropic/claude-3.5-sonnet'
    });
  });

  it('applies the saved dark mode preference to the document theme', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    await openSettings(user);
    await user.click(screen.getByLabelText('暗色模式'));
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('chatonphone.settings.v1') ?? '{}').darkMode).toBe(true);
  });
});
