import type { ComponentProps } from 'react';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Composer from '../../src/components/Composer';

interface ControlledComposerProps {
  isGenerating?: boolean;
  initialDraftText?: string;
  onDraftTextChange?: (value: string) => void;
  onSend?: ComponentProps<typeof Composer>['onSend'];
  onStop?: () => void;
}

function ControlledComposer({
  isGenerating = false,
  initialDraftText = '',
  onDraftTextChange,
  onSend = vi.fn(),
  onStop = vi.fn()
}: ControlledComposerProps) {
  const [draftText, setDraftText] = useState(initialDraftText);

  return (
    <Composer
      isGenerating={isGenerating}
      draftText={draftText}
      onDraftTextChange={(value) => {
        setDraftText(value);
        onDraftTextChange?.(value);
      }}
      onSend={onSend}
      onStop={onStop}
    />
  );
}

describe('Composer', () => {
  it('sends typed text', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();

    render(<ControlledComposer onSend={onSend} />);

    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSend).toHaveBeenCalledWith({ text: '你好', files: [] });
  });

  it('keeps draft text when sending fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('failed'));
    const user = userEvent.setup();

    render(<ControlledComposer onSend={onSend} />);

    await user.type(screen.getByLabelText('消息内容'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByLabelText('消息内容')).toHaveValue('你好');
    });
  });

  it('shows stop while generating', () => {
    render(<ControlledComposer isGenerating={true} />);

    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument();
  });

  it('uses controlled draft text', () => {
    render(<ControlledComposer initialDraftText="已有草稿" />);

    expect(screen.getByLabelText('消息内容')).toHaveValue('已有草稿');
  });

  it('reports draft text changes', async () => {
    const onDraftTextChange = vi.fn();
    const user = userEvent.setup();

    render(<ControlledComposer onDraftTextChange={onDraftTextChange} />);

    await user.type(screen.getByLabelText('消息内容'), '你好');

    expect(onDraftTextChange).toHaveBeenLastCalledWith('你好');
  });

  it('previews selected files and removes individual pending files', async () => {
    const firstImage = new File(['one'], 'one.png', { type: 'image/png' });
    const secondFile = new File(['two'], 'notes.txt', { type: 'text/plain' });
    const onSend = vi.fn();
    const user = userEvent.setup();

    render(<ControlledComposer onSend={onSend} />);

    await user.upload(screen.getByLabelText('选择文件'), [firstImage, secondFile]);

    expect(screen.getByRole('img', { name: 'one.png' })).toBeInTheDocument();
    expect(screen.getByText('notes.txt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '移除文件 one.png' }));
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.queryByRole('img', { name: 'one.png' })).not.toBeInTheDocument();
    expect(onSend).toHaveBeenCalledWith({ text: '', files: [secondFile] });
  });

  it('keeps remaining preview URLs active when one pending file is removed', async () => {
    const firstImage = new File(['one'], 'one.png', { type: 'image/png' });
    const secondImage = new File(['two'], 'two.png', { type: 'image/png' });
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:one')
      .mockReturnValueOnce('blob:two');
    const revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });

    render(<ControlledComposer />);

    await user.upload(screen.getByLabelText('选择文件'), [firstImage, secondImage]);
    await user.click(screen.getByRole('button', { name: '移除文件 one.png' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:one');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:two');
    expect(screen.getByRole('img', { name: 'two.png' })).toHaveAttribute('src', 'blob:two');
  });
});
