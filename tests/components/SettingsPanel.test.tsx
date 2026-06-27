import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SettingsPanel from '../../src/components/SettingsPanel';
import { defaultSettings } from '../../src/settings/settingsStore';

describe('SettingsPanel', () => {
  it('saves API settings from the form', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          providers: [
            {
              ...defaultSettings.providers![0],
              models: ['vision-model']
            }
          ],
          selectedModel: 'vision-model',
          model: 'vision-model'
        }}
        onSave={onSave}
        onResetLocalData={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('API Base URL'), 'https://gateway.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'secret');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'https://gateway.example.com/v1',
      apiKey: 'secret',
      model: 'vision-model'
    }));
  });

  it('syncs form fields when settings props change', () => {
    const { rerender } = render(
      <SettingsPanel
        settings={{ ...defaultSettings, apiKey: 'secret' }}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
      />
    );

    expect(screen.getByLabelText('API Key')).toHaveValue('secret');

    rerender(<SettingsPanel settings={defaultSettings} onSave={vi.fn()} onResetLocalData={vi.fn()} />);

    expect(screen.getByLabelText('API Key')).toHaveValue('');
  });

  it('keeps an unsaved provider draft when settings props refresh', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '新增供应商' }));
    await user.clear(screen.getByLabelText('供应商名称'));
    await user.type(screen.getByLabelText('供应商名称'), 'OpenRouter');
    await user.type(screen.getByLabelText('API Base URL'), 'https://openrouter.ai/api/v1');
    await user.type(screen.getByLabelText('API Key'), 'openrouter-secret');

    rerender(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          providers: [
            {
              ...defaultSettings.providers![0],
              apiBaseUrl: 'https://remote.example.com/v1',
              apiKey: 'remote-secret'
            }
          ]
        }}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
      />
    );

    expect(screen.getByLabelText('供应商')).toHaveValue('provider-2');
    expect(screen.getByLabelText('供应商名称')).toHaveValue('OpenRouter');
    expect(screen.getByLabelText('API Base URL')).toHaveValue('https://openrouter.ai/api/v1');
    expect(screen.getByLabelText('API Key')).toHaveValue('openrouter-secret');
  });

  it('saves model parameters without exposing request mode controls', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(<SettingsPanel settings={defaultSettings} onSave={onSave} onResetLocalData={vi.fn()} />);

    await user.clear(screen.getByLabelText('Temperature'));
    await user.type(screen.getByLabelText('Temperature'), '0.2');
    await user.clear(screen.getByLabelText('Max tokens'));
    await user.type(screen.getByLabelText('Max tokens'), '4096');
    await user.click(screen.getByLabelText('Streaming enabled'));
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(screen.queryByText('请求')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('请求模式')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('代理地址')).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 0.2,
      maxTokens: 4096,
      stream: false
    }));
  });

  it('loads model options from the active provider base url and key', async () => {
    const onFetchModels = vi.fn().mockResolvedValue(['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro']);
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={onSave}
        onResetLocalData={vi.fn()}
        onFetchModels={onFetchModels}
      />
    );

    await user.type(screen.getByLabelText('API Base URL'), 'https://openrouter.ai/api/v1');
    await user.type(screen.getByLabelText('API Key'), 'openrouter-secret');
    await user.click(screen.getByRole('button', { name: '拉取模型' }));
    await waitFor(() => expect(screen.getByLabelText('默认聊天模型')).toHaveValue('anthropic/claude-3.5-sonnet'));
    await user.selectOptions(screen.getByLabelText('默认聊天模型'), 'google/gemini-2.5-pro');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onFetchModels).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret'
    }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      model: 'google/gemini-2.5-pro',
      chatModel: 'google/gemini-2.5-pro',
      selectedModel: 'google/gemini-2.5-pro',
      providers: expect.arrayContaining([
        expect.objectContaining({
          models: ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro'],
          defaultModel: 'google/gemini-2.5-pro'
        })
      ])
    }));
  });

  it('adds a second provider and saves it as the selected provider', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(<SettingsPanel settings={defaultSettings} onSave={onSave} onResetLocalData={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '新增供应商' }));
    await user.clear(screen.getByLabelText('供应商名称'));
    await user.type(screen.getByLabelText('供应商名称'), 'OpenRouter');
    await user.type(screen.getByLabelText('API Base URL'), 'https://openrouter.ai/api/v1');
    await user.type(screen.getByLabelText('API Key'), 'openrouter-secret');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret',
      selectedProviderId: 'provider-2',
      providers: expect.arrayContaining([
        expect.objectContaining({
          id: 'provider-2',
          name: 'OpenRouter',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-secret',
          models: []
        })
      ])
    }));
  });

  it('saves loaded models on a second provider', async () => {
    const onSave = vi.fn();
    const onFetchModels = vi.fn().mockResolvedValue(['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro']);
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={onSave}
        onResetLocalData={vi.fn()}
        onFetchModels={onFetchModels}
      />
    );

    await user.click(screen.getByRole('button', { name: '新增供应商' }));
    await user.clear(screen.getByLabelText('供应商名称'));
    await user.type(screen.getByLabelText('供应商名称'), 'OpenRouter');
    await user.type(screen.getByLabelText('API Base URL'), 'https://openrouter.ai/api/v1');
    await user.type(screen.getByLabelText('API Key'), 'openrouter-secret');
    await user.click(screen.getByRole('button', { name: '拉取模型' }));
    await waitFor(() => expect(screen.getByLabelText('默认聊天模型')).toHaveValue('anthropic/claude-3.5-sonnet'));
    await user.selectOptions(screen.getByLabelText('默认聊天模型'), 'google/gemini-2.5-pro');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret',
      model: 'google/gemini-2.5-pro',
      chatModel: 'google/gemini-2.5-pro',
      selectedProviderId: 'provider-2',
      selectedModel: 'google/gemini-2.5-pro',
      providers: expect.arrayContaining([
        expect.objectContaining({
          id: 'provider-2',
          name: 'OpenRouter',
          apiBaseUrl: 'https://openrouter.ai/api/v1',
          apiKey: 'openrouter-secret',
          models: ['anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro'],
          defaultModel: 'google/gemini-2.5-pro'
        })
      ])
    }));
  });

  it('switches between configured providers before saving', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          selectedProviderId: 'openai',
          selectedModel: 'gpt-4o-mini',
          apiBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'openai-secret',
          model: 'gpt-4o-mini',
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
        }}
        onSave={onSave}
        onResetLocalData={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText('供应商'), 'openrouter');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(screen.getByLabelText('API Base URL')).toHaveValue('https://openrouter.ai/api/v1');
    expect(screen.getByLabelText('API Key')).toHaveValue('openrouter-secret');
    expect(screen.getByLabelText('默认聊天模型')).toHaveValue('anthropic/claude-3.5-sonnet');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'openrouter-secret',
      model: 'anthropic/claude-3.5-sonnet',
      chatModel: 'anthropic/claude-3.5-sonnet',
      selectedModel: 'anthropic/claude-3.5-sonnet',
      requestMode: 'proxy',
      proxyUrl: '',
      proxyAccessToken: '',
      selectedProviderId: 'openrouter'
    }));
  });

  it('saves a manually entered model without fetching the model list', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(<SettingsPanel settings={defaultSettings} onSave={onSave} onResetLocalData={vi.fn()} />);

    await user.type(screen.getByLabelText('API Base URL'), 'https://gateway.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'secret');
    await user.type(screen.getByLabelText('默认聊天模型'), 'manual-model');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      model: 'manual-model',
      chatModel: 'manual-model',
      selectedModel: 'manual-model',
      providers: expect.arrayContaining([
        expect.objectContaining({
          models: ['manual-model'],
          defaultModel: 'manual-model'
        })
      ])
    }));
  });

  it('uses the default chat model dropdown to choose the active model', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          providers: [
            {
              ...defaultSettings.providers![0],
              models: ['alpha-model', 'beta-model']
            }
          ],
          selectedModel: 'alpha-model',
          model: 'alpha-model'
        }}
        onSave={onSave}
        onResetLocalData={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText('默认聊天模型'), 'beta-model');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      model: 'beta-model',
      chatModel: 'beta-model',
      selectedModel: 'beta-model',
      providers: expect.arrayContaining([
        expect.objectContaining({
          models: ['alpha-model', 'beta-model'],
          defaultModel: 'beta-model'
        })
      ])
    }));
  });

  it('syncs the chat model when saving the provider default model', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          providers: [
            {
              ...defaultSettings.providers![0],
              models: ['setup-model', 'chat-model']
            }
          ],
          selectedModel: 'setup-model',
          model: 'chat-model',
          chatModel: 'chat-model'
        }}
        onSave={onSave}
        onResetLocalData={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText('默认聊天模型'), 'setup-model');
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      model: 'setup-model',
      chatModel: 'setup-model',
      selectedModel: 'setup-model'
    }));
  });

  it('tests the active provider with the selected manual model', async () => {
    const onTestProvider = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
        onTestProvider={onTestProvider}
      />
    );

    await user.type(screen.getByLabelText('API Base URL'), 'https://gateway.example.com/v1');
    await user.type(screen.getByLabelText('API Key'), 'secret');
    await user.type(screen.getByLabelText('默认聊天模型'), 'manual-model');
    await user.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => {
      expect(onTestProvider).toHaveBeenCalledWith(expect.objectContaining({
        apiBaseUrl: 'https://gateway.example.com/v1',
        apiKey: 'secret',
        model: 'manual-model',
        providers: expect.arrayContaining([
          expect.objectContaining({
            models: ['manual-model']
          })
        ])
      }));
    });
    expect(onTestProvider).toHaveBeenCalledWith(expect.objectContaining({
      providers: expect.arrayContaining([
        expect.objectContaining({
          defaultModel: 'manual-model'
        })
      ])
    }));
    expect(await screen.findByText('测试通过，供应商可用。')).toBeInTheDocument();
  });

  it('shows the sync account as read-only without login or register controls', () => {
    render(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          syncAccount: {
            endpoint: '',
            accountId: 'desktop-user',
            accessToken: 'saved-token',
            autoSync: true
          }
        }}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
      />
    );

    expect(screen.getByText('当前账号')).toBeInTheDocument();
    expect(screen.getByText('desktop-user')).toBeInTheDocument();
    expect(screen.queryByLabelText('账号')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('登录密码')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '注册账号' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登录账号' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('同步地址')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('同步令牌')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('自动同步设置')).not.toBeInTheDocument();
  });

  it('does not expose manual sync upload and download actions', () => {
    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '上传同步' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载同步' })).not.toBeInTheDocument();
  });

  it('saves the dark mode preference from the appearance toggle', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={onSave}
        onResetLocalData={vi.fn()}
      />
    );

    await user.click(screen.getByLabelText('暗色模式'));
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      darkMode: true
    }));
  });

  it('confirms before deleting a provider', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={{
          ...defaultSettings,
          selectedProviderId: 'openrouter',
          providers: [
            {
              ...defaultSettings.providers![0],
              id: 'openai',
              name: 'OpenAI',
              models: ['gpt-4o-mini'],
              defaultModel: 'gpt-4o-mini'
            },
            {
              ...defaultSettings.providers![0],
              id: 'openrouter',
              name: 'OpenRouter',
              apiBaseUrl: 'https://openrouter.ai/api/v1',
              apiKey: 'openrouter-secret',
              models: ['anthropic/claude-3.5-sonnet'],
              defaultModel: 'anthropic/claude-3.5-sonnet'
            }
          ]
        }}
        onSave={onSave}
        onResetLocalData={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '删除供应商' }));
    expect(screen.getByRole('alertdialog', { name: '删除供应商？' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '删除供应商' }).at(-1)!);
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      selectedProviderId: 'openai',
      providers: [
        expect.objectContaining({
          id: 'openai'
        })
      ]
    }));
  });

  it('confirms before clearing local data', async () => {
    const onResetLocalData = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={vi.fn()}
        onResetLocalData={onResetLocalData}
      />
    );

    await user.click(screen.getByRole('button', { name: '清除本机数据' }));
    expect(onResetLocalData).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: '清除本机数据？' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '清除本机数据' }).at(-1)!);

    expect(onResetLocalData).toHaveBeenCalledTimes(1);
  });

  it('confirms before discarding an unsaved draft from cancel', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(
      <SettingsPanel
        settings={defaultSettings}
        onSave={vi.fn()}
        onResetLocalData={vi.fn()}
        onCancel={onCancel}
      />
    );

    await user.type(screen.getByLabelText('API Key'), 'secret');
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: '放弃未保存更改？' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '放弃更改' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
