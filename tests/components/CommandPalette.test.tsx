import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CommandPalette from '../../src/components/CommandPalette';

describe('CommandPalette', () => {
  it('renders command list when open', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        conversations={[]}
        activeConversationId="conv-1"
        providers={[]}
        selectedModel=""
        onCommand={vi.fn()}
      />
    );

    expect(screen.getByLabelText('命令搜索')).toBeInTheDocument();
    expect(screen.getByText('新建会话')).toBeInTheDocument();
    expect(screen.getByText('打开设置')).toBeInTheDocument();
  });

  it('filters commands by query', async () => {
    const user = userEvent.setup();

    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        conversations={[]}
        activeConversationId="conv-1"
        providers={[]}
        selectedModel=""
        onCommand={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('命令搜索'), '设置');

    expect(screen.getByText('打开设置')).toBeInTheDocument();
    expect(screen.queryByText('新建会话')).not.toBeInTheDocument();
  });

  it('executes command on selection', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CommandPalette
        open={true}
        onOpenChange={onOpenChange}
        conversations={[]}
        activeConversationId="conv-1"
        providers={[]}
        selectedModel=""
        onCommand={onCommand}
      />
    );

    await user.click(screen.getByText('新建会话'));

    expect(onCommand).toHaveBeenCalledWith({ type: 'new' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('includes conversations in search results', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        conversations={[
          {
            id: 'conv-1',
            title: '测试会话',
            messages: [],
            model: 'gpt-4',
            createdAt: 1,
            updatedAt: 1
          }
        ]}
        activeConversationId="conv-1"
        providers={[]}
        selectedModel=""
        onCommand={vi.fn()}
      />
    );

    expect(screen.getByText('切换至会话：测试会话')).toBeInTheDocument();
  });

  it('navigates with arrow keys and executes with Enter', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();

    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        conversations={[]}
        activeConversationId="conv-1"
        providers={[]}
        selectedModel=""
        onCommand={onCommand}
      />
    );

    const input = screen.getByLabelText('命令搜索');
    input.focus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(onCommand).toHaveBeenCalledWith({ type: 'open-settings' });
  });
});
