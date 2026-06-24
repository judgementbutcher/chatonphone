import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MessageList from '../../src/components/MessageList';

const messages = [
  { id: 'u1', role: 'user' as const, text: '问题', attachments: [], createdAt: 1 },
  { id: 'a1', role: 'assistant' as const, text: '回答', attachments: [], createdAt: 2 }
];

describe('MessageList actions', () => {
  it('calls edit and regenerate handlers', async () => {
    const user = userEvent.setup();
    const onEditUserMessage = vi.fn();
    const onRegenerate = vi.fn();

    render(
      <MessageList
        messages={messages}
        onEditUserMessage={onEditUserMessage}
        onRegenerate={onRegenerate}
      />
    );

    await user.click(screen.getByRole('button', { name: '编辑消息 u1' }));
    await user.click(screen.getByRole('button', { name: '重新生成' }));

    expect(onEditUserMessage).toHaveBeenCalledWith(messages[0]);
    expect(onRegenerate).toHaveBeenCalledWith(messages[1]);
  });

  it('does not offer regeneration when the final message is a user message', () => {
    render(
      <MessageList
        messages={[
          ...messages,
          { id: 'u2', role: 'user' as const, text: '后续问题', attachments: [], createdAt: 3 }
        ]}
        onRegenerate={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '重新生成' })).not.toBeInTheDocument();
  });

  it('copies individual code blocks', async () => {
    const writeText = vi.fn();
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText }
    });

    render(
      <MessageList
        messages={[
          {
            id: 'a1',
            role: 'assistant' as const,
            text: '```ts\nconst value = 1;\n```',
            attachments: [],
            createdAt: 1
          }
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: '复制代码块 1' }));

    expect(writeText).toHaveBeenCalledWith('const value = 1;');
  });

  it('shows text file attachments without rendering them as images', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'u1',
            role: 'user' as const,
            text: '请看附件',
            attachments: [
              {
                id: 'file1',
                kind: 'text' as const,
                name: 'notes.md',
                mimeType: 'text/markdown',
                text: '# Notes',
                sizeBytes: 7
              }
            ],
            createdAt: 1
          }
        ]}
      />
    );

    expect(screen.getByText('notes.md')).toBeInTheDocument();
    expect(screen.getByText('7 B')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'notes.md' })).not.toBeInTheDocument();
  });

  it('wraps markdown tables in a scrollable container', () => {
    const { container } = render(
      <MessageList
        messages={[
          {
            id: 'a1',
            role: 'assistant' as const,
            text: '| 列A | 列B |\n|-----|-----|\n| 1 | 2 |',
            attachments: [],
            createdAt: 1
          }
        ]}
      />
    );

    const scrollContainer = container.querySelector('.tableScroll');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer?.querySelector('table')).toBeInTheDocument();
  });
});
