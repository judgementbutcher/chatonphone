import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGlobalHotkeys, type UseGlobalHotkeysHandlers } from '../../src/hooks/useGlobalHotkeys';

function TestHarness({ handlers }: { handlers: UseGlobalHotkeysHandlers }) {
  useGlobalHotkeys(handlers);
  return <div>test</div>;
}

describe('useGlobalHotkeys', () => {
  it('triggers command palette on Mod+K', () => {
    const handlers: UseGlobalHotkeysHandlers = {
      onNewConversation: vi.fn(),
      onTogglePalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleConversations: vi.fn(),
      onEscape: vi.fn(),
      focusComposer: vi.fn(),
      loadLastUserMessage: vi.fn()
    };

    render(<TestHarness handlers={handlers} />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

    expect(handlers.onTogglePalette).toHaveBeenCalledTimes(1);
  });

  it('triggers escape handler on Escape key', () => {
    const handlers: UseGlobalHotkeysHandlers = {
      onNewConversation: vi.fn(),
      onTogglePalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleConversations: vi.fn(),
      onEscape: vi.fn(),
      focusComposer: vi.fn(),
      loadLastUserMessage: vi.fn()
    };

    render(<TestHarness handlers={handlers} />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(handlers.onEscape).toHaveBeenCalledTimes(1);
  });

  it('focuses composer on / when not in editable element', () => {
    const handlers: UseGlobalHotkeysHandlers = {
      onNewConversation: vi.fn(),
      onTogglePalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleConversations: vi.fn(),
      onEscape: vi.fn(),
      focusComposer: vi.fn(),
      loadLastUserMessage: vi.fn()
    };

    render(<TestHarness handlers={handlers} />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));

    expect(handlers.focusComposer).toHaveBeenCalledTimes(1);
  });

  it('does not trigger hotkeys inside input elements', () => {
    const handlers: UseGlobalHotkeysHandlers = {
      onNewConversation: vi.fn(),
      onTogglePalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleConversations: vi.fn(),
      onEscape: vi.fn(),
      focusComposer: vi.fn(),
      loadLastUserMessage: vi.fn()
    };

    render(
      <>
        <TestHarness handlers={handlers} />
        <input type="text" id="test-input" />
      </>
    );

    const input = document.getElementById('test-input') as HTMLInputElement;
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });
    input.dispatchEvent(event);

    expect(handlers.onNewConversation).not.toHaveBeenCalled();
  });

  it('triggers new conversation on Mod+N', () => {
    const handlers: UseGlobalHotkeysHandlers = {
      onNewConversation: vi.fn(),
      onTogglePalette: vi.fn(),
      onOpenSettings: vi.fn(),
      onToggleConversations: vi.fn(),
      onEscape: vi.fn(),
      focusComposer: vi.fn(),
      loadLastUserMessage: vi.fn()
    };

    render(<TestHarness handlers={handlers} />);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }));

    expect(handlers.onNewConversation).toHaveBeenCalledTimes(1);
  });
});
