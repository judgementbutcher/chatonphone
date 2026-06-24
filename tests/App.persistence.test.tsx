import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, saveSettings } from '../src/settings/settingsStore';

const storageMock = vi.hoisted(() => ({
  deleteConversation: vi.fn(),
  listConversations: vi.fn(),
  resetLocalData: vi.fn(),
  saveConversation: vi.fn()
}));

vi.mock('../src/storage/conversationRepo', () => storageMock);

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

function imageFile(name = 'photo.jpg') {
  return new File(['image-data'], name, { type: 'image/jpeg' });
}

function installControlledImagePipelineMocks() {
  const originalCreateElement = document.createElement.bind(document);
  const readers: Array<{ finish: () => void }> = [];
  const images: Array<{ finish: () => void }> = [];

  class MockFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL(file: File) {
      this.result = `data:${file.type};base64,b3JpZ2luYWw=`;
      readers.push({ finish: () => this.onload?.() });
    }
  }

  class MockImage {
    naturalWidth = 320;
    naturalHeight = 240;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      images.push({ finish: () => this.onload?.() });
    }
  }

  const canvas = {
    width: 0,
    height: 0,
    drawImage: vi.fn(),
    toDataURL: vi.fn((type: string) => `data:${type};base64,YQ==`),
    getContext: vi.fn(() => ({ drawImage: canvas.drawImage }))
  };

  vi.stubGlobal('FileReader', MockFileReader);
  vi.stubGlobal('Image', MockImage);
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName === 'canvas') {
      return canvas as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });

  return {
    canvas,
    images,
    readers,
    async finishFirstConversion() {
      if (!readers[0]) {
        throw new Error('Expected an image read to be pending.');
      }

      await act(async () => {
        readers[0].finish();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(images).toHaveLength(1);
      });

      await act(async () => {
        images[0].finish();
        await Promise.resolve();
        await Promise.resolve();
      });
    }
  };
}

async function stopGenerationIfActive(user: ReturnType<typeof userEvent.setup>) {
  const stopButton = screen.queryByRole('button', { name: '停止' });

  if (stopButton) {
    await user.click(stopButton);
  }
}

describe('App persistence', () => {
  beforeEach(() => {
    storageMock.deleteConversation.mockReset();
    storageMock.listConversations.mockReset();
    storageMock.resetLocalData.mockReset();
    storageMock.saveConversation.mockReset();
    storageMock.listConversations.mockResolvedValue([]);
    storageMock.resetLocalData.mockResolvedValue(undefined);
    storageMock.deleteConversation.mockResolvedValue(undefined);
    localStorage.clear();
    saveAuthenticatedSettings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('derives a new conversation title from the first user message', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();

    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), '请帮我总结  这段文字\n并列出重点');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    expect(storageMock.saveConversation.mock.calls[0][0]).toMatchObject({
      title: '请帮我总结 这段文字 并列出重点'
    });
    expect(await within(screen.getByRole('banner')).findByText('请帮我总结 这段文字 并列出重点')).toBeInTheDocument();
  });

  it('keeps an existing non-default conversation title when saving messages', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '这句话不应该覆盖标题');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    expect(storageMock.saveConversation.mock.calls[0][0]).toMatchObject({
      title: '旧会话'
    });
  });

  it('preserves a delayed image draft and skips saving when reset changes the send context', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pipeline = installControlledImagePipelineMocks();

    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), '带图旧消息');
    await user.upload(screen.getByLabelText('选择文件'), imageFile());
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(pipeline.readers).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(storageMock.resetLocalData).toHaveBeenCalledTimes(1);

    await pipeline.finishFirstConversion();

    expect(storageMock.saveConversation).not.toHaveBeenCalled();
    expect(screen.getByLabelText('消息内容')).toHaveValue('带图旧消息');

    const messageList = screen.getByLabelText('消息列表');
    expect(within(messageList).queryByText('带图旧消息')).toBeNull();
    expect(within(messageList).queryByAltText('photo.jpg')).toBeNull();
  });

  it('preserves a delayed image draft and skips saving when the active conversation changes', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pipeline = installControlledImagePipelineMocks();
    const firstConversation = {
      id: 'c1',
      title: '第一会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };
    const secondConversation = {
      id: 'c2',
      title: '第二会话',
      model: 'vision-model',
      createdAt: 2,
      updatedAt: 2,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([firstConversation, secondConversation]);

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '第一会话' }));
    await user.type(screen.getByLabelText('消息内容'), '发给第一');
    await user.upload(screen.getByLabelText('选择文件'), imageFile());
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(pipeline.readers).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: '第二会话' }));

    expect(screen.getByRole('button', { name: '第二会话' })).toHaveAttribute('aria-current', 'true');

    await pipeline.finishFirstConversion();

    expect(storageMock.saveConversation).not.toHaveBeenCalled();
    expect(screen.getByLabelText('消息内容')).toHaveValue('发给第一');
    expect(within(screen.getByLabelText('消息列表')).queryByText('发给第一')).toBeNull();
  });

  it('shows an error and reconciles conversations when reset storage fails', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.resetLocalData.mockRejectedValue(new Error('IndexedDB reset failed'));

    render(<App />);

    await screen.findByRole('button', { name: '旧会话' });
    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('清除本机数据失败，请重试。');
    expect(await screen.findByRole('button', { name: '旧会话' })).toBeInTheDocument();
  });

  it('restores persisted settings when reset storage fails', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();

    saveSettings({
      ...defaultSettings,
      apiBaseUrl: 'https://gateway.example.com/v1',
      apiKey: 'secret',
      model: 'vision-model',
      requestMode: 'proxy',
      proxyUrl: 'https://proxy.example.com',
      proxyAccessToken: 'proxy-secret',
      syncAccount: {
        endpoint: '',
        accountId: 'desktop-user',
        accessToken: 'saved-token',
        autoSync: false
      }
    });
    storageMock.resetLocalData.mockRejectedValue(new Error('IndexedDB reset failed'));

    render(<App />);

    expect(screen.getByLabelText('API Base URL')).toHaveValue('https://gateway.example.com/v1');
    expect(screen.getByLabelText('API Key')).toHaveValue('secret');
    expect(screen.getByLabelText('模型名')).toHaveValue('vision-model');
    expect(screen.queryByLabelText('请求模式')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('代理地址')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('清除本机数据失败，请重试。');
    await waitFor(() => {
      expect(screen.getByLabelText('API Base URL')).toHaveValue('https://gateway.example.com/v1');
      expect(screen.getByLabelText('API Key')).toHaveValue('secret');
      expect(screen.getByLabelText('模型名')).toHaveValue('vision-model');
      expect(screen.queryByLabelText('请求模式')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('代理地址')).not.toBeInTheDocument();
    });
  });

  it('does not purge a pending autosave when reset storage fails', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSave: { resolve?: () => void } = {};
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.resetLocalData.mockRejectedValue(new Error('IndexedDB reset failed'));
    storageMock.saveConversation.mockImplementation((conversation: { id: string }) => {
      if (conversation.id === 'c1') {
        return new Promise<void>((resolve) => {
          pendingSave.resolve = resolve;
        });
      }

      return Promise.resolve();
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('清除本机数据失败，请重试。');
    expect(await screen.findByRole('button', { name: '旧会话' })).toBeInTheDocument();

    if (!pendingSave.resolve) {
      throw new Error('Expected autosave to be pending.');
    }

    const listCallsBeforeSaveSettles = storageMock.listConversations.mock.calls.length;

    pendingSave.resolve();

    await waitFor(() => {
      const deletedConversation = storageMock.deleteConversation.mock.calls.some(([id]) => id === 'c1');
      const reconciledConversation = storageMock.listConversations.mock.calls.length > listCallsBeforeSaveSettles;
      expect(deletedConversation || reconciledConversation).toBe(true);
    });

    const deleteCallsForConversation = storageMock.deleteConversation.mock.calls.filter(([id]) => id === 'c1');
    expect(deleteCallsForConversation).toHaveLength(0);
    expect(screen.getByRole('button', { name: '旧会话' })).toBeInTheDocument();
  });

  it('does not purge a pending rename save when reset storage fails', async () => {
    const { default: App } = await import('../src/App');
    const pendingSave: { resolve?: () => void } = {};
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.resetLocalData.mockRejectedValue(new Error('IndexedDB reset failed'));
    storageMock.saveConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingSave.resolve = resolve;
    }));

    render(<App />);

    fireEvent.change(await screen.findByLabelText('重命名 旧会话'), { target: { value: '新标题' } });

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('清除本机数据失败，请重试。');

    if (!pendingSave.resolve) {
      throw new Error('Expected rename save to be pending.');
    }

    const listCallsBeforeSaveSettles = storageMock.listConversations.mock.calls.length;

    pendingSave.resolve();

    await waitFor(() => {
      const deletedConversation = storageMock.deleteConversation.mock.calls.some(([id]) => id === 'c1');
      const reconciledConversation = storageMock.listConversations.mock.calls.length > listCallsBeforeSaveSettles;
      expect(deletedConversation || reconciledConversation).toBe(true);
    });

    const deleteCallsForConversation = storageMock.deleteConversation.mock.calls.filter(([id]) => id === 'c1');
    expect(deleteCallsForConversation).toHaveLength(0);
  });

  it('keeps saves queued behind pending autosaves when reset storage fails', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSaves: Array<{
      conversation: {
        id: string;
        messages: Array<{ role: string; text: string }>;
      };
      resolve: () => void;
    }> = [];
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.resetLocalData.mockRejectedValue(new Error('IndexedDB reset failed'));
    storageMock.saveConversation.mockImplementation((conversation: {
      id: string;
      messages: Array<{ role: string; text: string }>;
    }) => new Promise<void>((resolve) => {
      pendingSaves.push({ conversation, resolve });
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '旧消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('清除本机数据失败，请重试。');
    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '恢复后的消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);

    pendingSaves[0].resolve();

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(2);
    });

    expect(pendingSaves[1].conversation.id).toBe('c1');
    expect(pendingSaves[1].conversation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: '恢复后的消息' })
    ]));
  });

  it('shows an error and reconciles conversations when delete storage fails', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.deleteConversation.mockRejectedValue(new Error('IndexedDB delete failed'));

    render(<App />);

    await screen.findByRole('button', { name: '旧会话' });
    await user.click(screen.getByRole('button', { name: '删除 旧会话' }));

    expect(storageMock.deleteConversation).toHaveBeenCalledWith('c1');
    expect(await screen.findByRole('alert')).toHaveTextContent('删除会话失败，请重试。');
    expect(await screen.findByRole('button', { name: '旧会话' })).toBeInTheDocument();
  });

  it('keeps saves queued behind pending autosaves when delete storage fails', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSaves: Array<{
      conversation: {
        id: string;
        messages: Array<{ role: string; text: string }>;
      };
      resolve: () => void;
    }> = [];
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.deleteConversation.mockRejectedValueOnce(new Error('IndexedDB delete failed'));
    storageMock.saveConversation.mockImplementation((conversation: {
      id: string;
      messages: Array<{ role: string; text: string }>;
    }) => new Promise<void>((resolve) => {
      pendingSaves.push({ conversation, resolve });
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '旧消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '删除 旧会话' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('删除会话失败，请重试。');
    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '恢复后的消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);

    pendingSaves[0].resolve();

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(2);
    });

    expect(pendingSaves[1].conversation.id).toBe('c1');
    expect(pendingSaves[1].conversation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: '恢复后的消息' })
    ]));
  });

  it('clears reset state immediately and prevents old autosaves while reset is pending', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingReset: { resolve?: () => void } = {};
    const savedConversations: Array<{
      id: string;
      title: string;
      model: string;
      createdAt: number;
      updatedAt: number;
      messages: unknown[];
    }> = [];

    storageMock.listConversations.mockImplementation(() => Promise.resolve(savedConversations));
    storageMock.resetLocalData.mockImplementation(() => new Promise<void>((resolve) => {
      pendingReset.resolve = resolve;
    }));
    storageMock.saveConversation.mockImplementation((conversation: {
      id: string;
      title: string;
      model: string;
      createdAt: number;
      updatedAt: number;
      messages: unknown[];
    }) => {
      savedConversations.splice(0, savedConversations.length, conversation);
      return Promise.resolve();
    });

    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), '旧消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });
    const oldConversationId = storageMock.saveConversation.mock.calls[0][0].id;

    await screen.findByRole('button', { name: '旧消息' });

    await stopGenerationIfActive(user);
    const saveCallsAtResetStart = storageMock.saveConversation.mock.calls.length;

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    expect(storageMock.resetLocalData).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('消息内容'), '重置期间');
    await user.click(screen.getByRole('button', { name: '发送' }));

    const messageList = screen.getByLabelText('消息列表');
    expect(within(messageList).queryByText('旧消息')).toBeNull();
    expect(within(messageList).queryByText('重置期间')).toBeNull();
    expect(screen.getAllByRole('button', { name: '新会话' })).toHaveLength(1);

    const oldConversationSavesAfterReset = storageMock.saveConversation.mock.calls
      .slice(saveCallsAtResetStart)
      .filter(([conversation]) => conversation.id === oldConversationId);
    expect(oldConversationSavesAfterReset).toHaveLength(0);

    if (!pendingReset.resolve) {
      throw new Error('Expected reset to be pending.');
    }

    pendingReset.resolve();

    await waitFor(() => {
      expect(screen.queryByText('旧消息')).toBeNull();
    });
    expect(screen.getAllByRole('button', { name: '新会话' })).toHaveLength(1);
  });

  it('ignores overlapping reset clicks and blocks sends until the reset resolves', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingReset: { resolve?: () => void } = {};

    storageMock.resetLocalData.mockImplementation(() => new Promise<void>((resolve) => {
      pendingReset.resolve = resolve;
    }));

    render(<App />);

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));
    expect(storageMock.resetLocalData).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));
    expect(storageMock.resetLocalData).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('消息内容'), '重置期间');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(storageMock.saveConversation).not.toHaveBeenCalled();
    expect(within(screen.getByLabelText('消息列表')).queryByText('重置期间')).toBeNull();

    if (!pendingReset.resolve) {
      throw new Error('Expected reset to be pending.');
    }

    await act(async () => {
      pendingReset.resolve?.();
      await Promise.resolve();
    });

    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });
    expect(within(screen.getByLabelText('消息列表')).getByText('重置期间')).toBeInTheDocument();
  });

  it('optimistically removes active pending deletes and preserves newer selections', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingDelete: { resolve?: () => void } = {};
    const firstConversation = {
      id: 'c1',
      title: '第一会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        {
          id: 'm1',
          role: 'user' as const,
          text: '第一旧消息',
          attachments: [],
          createdAt: 1
        }
      ]
    };
    const secondConversation = {
      id: 'c2',
      title: '第二会话',
      model: 'vision-model',
      createdAt: 2,
      updatedAt: 2,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([firstConversation, secondConversation]);
    storageMock.saveConversation.mockImplementation(() => new Promise<void>(() => undefined));
    storageMock.deleteConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingDelete.resolve = resolve;
    }));

    render(<App />);

    const staleFirstButton = await screen.findByRole('button', { name: '第一会话' });
    await user.click(staleFirstButton);

    await screen.findByText('第一旧消息');

    await user.click(screen.getByRole('button', { name: '删除 第一会话' }));

    expect(storageMock.deleteConversation).toHaveBeenCalledWith('c1');
    expect(screen.queryByRole('button', { name: '第一会话' })).toBeNull();
    expect(screen.queryByText('第一旧消息')).toBeNull();

    fireEvent.click(staleFirstButton);

    expect(screen.queryByText('第一旧消息')).toBeNull();

    await user.click(screen.getByRole('button', { name: '第二会话' }));
    expect(screen.getByRole('button', { name: '第二会话' })).toHaveAttribute('aria-current', 'true');

    if (!pendingDelete.resolve) {
      throw new Error('Expected delete to be pending.');
    }

    const listCallsBeforeDeleteSettles = storageMock.listConversations.mock.calls.length;

    pendingDelete.resolve();

    await waitFor(() => {
      expect(storageMock.listConversations.mock.calls.length).toBeGreaterThan(listCallsBeforeDeleteSettles);
    });
    expect(screen.queryByRole('button', { name: '第一会话' })).toBeNull();
    expect(screen.getByRole('button', { name: '第二会话' })).toHaveAttribute('aria-current', 'true');
  });

  it('invalidates pending conversation saves after local data reset', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    let savedId = '';
    const pendingSave: { resolve?: () => void } = {};

    storageMock.saveConversation.mockImplementation((conversation: { id: string }) => {
      savedId = conversation.id;
      return new Promise<void>((resolve) => {
        pendingSave.resolve = resolve;
      });
    });

    render(<App />);

    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    if (!pendingSave.resolve) {
      throw new Error('Expected save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(storageMock.deleteConversation).toHaveBeenCalledWith(savedId);
    });
  });

  it('surfaces cleanup delete failures after stale saves and filters the stale conversation', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSave: { resolve?: () => void } = {};
    const staleConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([staleConversation]);
    storageMock.deleteConversation.mockRejectedValue(new Error('IndexedDB cleanup failed'));
    storageMock.saveConversation.mockImplementation((conversation: { id: string }) => {
      if (conversation.id === 'c1') {
        return new Promise<void>((resolve) => {
          pendingSave.resolve = resolve;
        });
      }

      return Promise.resolve();
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '旧消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));

    if (!pendingSave.resolve) {
      throw new Error('Expected save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(storageMock.deleteConversation).toHaveBeenCalledWith('c1');
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('清理已失效会话失败，请重试。');

    await user.type(screen.getByLabelText('消息内容'), '新消息');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.listConversations).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('button', { name: '旧会话' })).toBeNull();
  });

  it('invalidates pending saves after deleting an inactive conversation', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSave: { resolve?: () => void } = {};
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.saveConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingSave.resolve = resolve;
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    await user.click(screen.getAllByRole('button', { name: '新会话' })[0]);
    await user.click(screen.getByRole('button', { name: '删除 旧会话' }));

    if (!pendingSave.resolve) {
      throw new Error('Expected save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      const deleteCallsForConversation = storageMock.deleteConversation.mock.calls.filter(([id]) => id === 'c1');
      expect(deleteCallsForConversation).toHaveLength(2);
    });
  });

  it('filters deleted conversations from stale refresh results', async () => {
    const { default: App } = await import('../src/App');
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations
      .mockResolvedValueOnce([storedConversation])
      .mockResolvedValue([storedConversation]);

    render(<App />);

    await screen.findByRole('button', { name: '旧会话' });
    fireEvent.click(screen.getByRole('button', { name: '删除 旧会话' }));

    await waitFor(() => {
      expect(storageMock.listConversations).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole('button', { name: '旧会话' })).toBeNull();
  });

  it('does not invalidate pending saves for other conversations after deleting the active conversation', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSave: { resolve?: () => void } = {};
    const firstConversation = {
      id: 'c1',
      title: '第一会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };
    const secondConversation = {
      id: 'c2',
      title: '第二会话',
      model: 'vision-model',
      createdAt: 2,
      updatedAt: 2,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([firstConversation, secondConversation]);
    storageMock.saveConversation.mockImplementation((conversation: { id: string }) => {
      if (conversation.id === 'c1') {
        return new Promise<void>((resolve) => {
          pendingSave.resolve = resolve;
        });
      }

      return Promise.resolve();
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '第一会话' }));
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '第二会话' }));
    await user.click(screen.getByRole('button', { name: '删除 第二会话' }));

    await waitFor(() => {
      expect(storageMock.deleteConversation).toHaveBeenCalledWith('c2');
    });

    if (!pendingSave.resolve) {
      throw new Error('Expected save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      const deletedFirstConversation = storageMock.deleteConversation.mock.calls.some(([id]) => id === 'c1');
      const refreshedAfterSave = storageMock.listConversations.mock.calls.length >= 3;
      expect(deletedFirstConversation || refreshedAfterSave).toBe(true);
    });

    const deleteCallsForFirstConversation = storageMock.deleteConversation.mock.calls.filter(([id]) => id === 'c1');
    expect(deleteCallsForFirstConversation).toHaveLength(0);
  });

  it('does not invalidate pending renames for other conversations after deleting the active conversation', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSave: { resolve?: () => void } = {};
    const firstConversation = {
      id: 'c1',
      title: '第一会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };
    const secondConversation = {
      id: 'c2',
      title: '第二会话',
      model: 'vision-model',
      createdAt: 2,
      updatedAt: 2,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([firstConversation, secondConversation]);
    storageMock.saveConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingSave.resolve = resolve;
    }));

    render(<App />);

    fireEvent.change(await screen.findByLabelText('重命名 第一会话'), { target: { value: '第一新标题' } });

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: '第二会话' }));
    await user.click(screen.getByRole('button', { name: '删除 第二会话' }));

    await waitFor(() => {
      expect(storageMock.deleteConversation).toHaveBeenCalledWith('c2');
    });

    if (!pendingSave.resolve) {
      throw new Error('Expected rename save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      const deletedFirstConversation = storageMock.deleteConversation.mock.calls.some(([id]) => id === 'c1');
      const refreshedAfterRename = storageMock.listConversations.mock.calls.length >= 3;
      expect(deletedFirstConversation || refreshedAfterRename).toBe(true);
    });

    const deleteCallsForFirstConversation = storageMock.deleteConversation.mock.calls.filter(([id]) => id === 'c1');
    expect(deleteCallsForFirstConversation).toHaveLength(0);
  });

  it('invalidates pending rename saves after local data reset', async () => {
    const { default: App } = await import('../src/App');
    const pendingSave: { resolve?: () => void } = {};
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };
    const renamedConversation = {
      ...storedConversation,
      title: '新标题',
      updatedAt: 2
    };

    storageMock.listConversations
      .mockResolvedValueOnce([storedConversation])
      .mockResolvedValue([renamedConversation]);
    storageMock.saveConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingSave.resolve = resolve;
    }));

    render(<App />);

    const renameInput = await screen.findByLabelText('重命名 旧会话');
    fireEvent.change(renameInput, { target: { value: '新标题' } });

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: '清除本机数据' }));

    await waitFor(() => {
      expect(storageMock.resetLocalData).toHaveBeenCalled();
    });

    if (!pendingSave.resolve) {
      throw new Error('Expected rename save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(storageMock.deleteConversation).toHaveBeenCalledWith('c1');
    });
    expect(screen.queryByRole('button', { name: '新标题' })).toBeNull();
  });

  it('persists renames with active messages instead of stale sidebar snapshots', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSave: { resolve?: () => void } = {};
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.saveConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingSave.resolve = resolve;
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('重命名 旧会话'), { target: { value: '新标题' } });

    expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);

    if (!pendingSave.resolve) {
      throw new Error('Expected save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(2);
    });

    const renamePayload = storageMock.saveConversation.mock.calls[1][0] as {
      title: string;
      messages: Array<{ role: string; text: string }>;
    };

    expect(renamePayload.title).toBe('新标题');
    expect(renamePayload.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: '你好' }),
      expect.objectContaining({ role: 'assistant', text: '' })
    ]));
  });

  it('serializes rename saves behind pending autosaves for the same conversation', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSaves: Array<{
      conversation: {
        title: string;
        messages: Array<{ role: string; text: string }>;
      };
      resolve: () => void;
    }> = [];
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.saveConversation.mockImplementation((conversation: {
      title: string;
      messages: Array<{ role: string; text: string }>;
    }) => new Promise<void>((resolve) => {
      pendingSaves.push({ conversation, resolve });
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });
    expect(pendingSaves[0].conversation.title).toBe('旧会话');

    fireEvent.change(screen.getByLabelText('重命名 旧会话'), { target: { value: '新标题' } });

    expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);

    pendingSaves[0].resolve();

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(2);
    });

    expect(pendingSaves[1].conversation.title).toBe('新标题');
    expect(pendingSaves[1].conversation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: '你好' }),
      expect.objectContaining({ role: 'assistant', text: '' })
    ]));
  });

  it('keeps queued rename snapshots authoritative over stale autosave refreshes', async () => {
    const { default: App } = await import('../src/App');
    const user = userEvent.setup();
    const pendingSaves: Array<{
      conversation: {
        title: string;
        messages: Array<{ role: string; text: string }>;
      };
      resolve: () => void;
    }> = [];
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };
    const staleStoredConversation = {
      ...storedConversation,
      messages: [
        {
          id: 'm1',
          role: 'user' as const,
          text: '你好',
          attachments: [],
          createdAt: 1
        }
      ]
    };

    storageMock.listConversations
      .mockResolvedValueOnce([storedConversation])
      .mockResolvedValue([staleStoredConversation]);
    storageMock.saveConversation.mockImplementation((conversation: {
      title: string;
      messages: Array<{ role: string; text: string }>;
    }) => new Promise<void>((resolve) => {
      pendingSaves.push({ conversation, resolve });
    }));

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '旧会话' }));
    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('重命名 旧会话'), { target: { value: '新标题' } });

    expect(storageMock.saveConversation).toHaveBeenCalledTimes(1);

    pendingSaves[0].resolve();

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(storageMock.listConversations).toHaveBeenCalledTimes(2);
    });

    await stopGenerationIfActive(user);
    await user.type(screen.getByLabelText('消息内容'), '再见');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(storageMock.saveConversation).toHaveBeenCalledTimes(2);

    pendingSaves[1].resolve();

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalledTimes(3);
    });

    expect(pendingSaves[2].conversation.title).toBe('新标题');
    expect(pendingSaves[2].conversation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: '你好' }),
      expect.objectContaining({ role: 'user', text: '再见' })
    ]));
  });

  it('invalidates pending rename saves after deleting a conversation', async () => {
    const { default: App } = await import('../src/App');
    const pendingSave: { resolve?: () => void } = {};
    const storedConversation = {
      id: 'c1',
      title: '旧会话',
      model: 'vision-model',
      createdAt: 1,
      updatedAt: 1,
      messages: []
    };

    storageMock.listConversations.mockResolvedValue([storedConversation]);
    storageMock.saveConversation.mockImplementation(() => new Promise<void>((resolve) => {
      pendingSave.resolve = resolve;
    }));

    render(<App />);

    const renameInput = await screen.findByLabelText('重命名 旧会话');
    fireEvent.change(renameInput, { target: { value: '新标题' } });

    await waitFor(() => {
      expect(storageMock.saveConversation).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: '删除 新标题' }));

    if (!pendingSave.resolve) {
      throw new Error('Expected rename save to be pending.');
    }

    pendingSave.resolve();

    await waitFor(() => {
      const deleteCallsForConversation = storageMock.deleteConversation.mock.calls.filter(([id]) => id === 'c1');
      expect(deleteCallsForConversation).toHaveLength(2);
    });
  });
});
