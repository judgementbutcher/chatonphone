import { useEffect } from 'react';

export interface UseGlobalHotkeysHandlers {
  onNewConversation: () => void;
  onTogglePalette: () => void;
  onOpenSettings: () => void;
  onToggleConversations: () => void;
  onEscape: () => void;
  focusComposer: () => void;
  loadLastUserMessage: () => void;
}

function isEditableElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') {
    return true;
  }

  if (element.isContentEditable) {
    return true;
  }

  return false;
}

export function useGlobalHotkeys(handlers: UseGlobalHotkeysHandlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      const target = event.target;
      const isEditable = isEditableElement(target);

      // Mod+N: New conversation
      if (isMod && event.key === 'n' && !isEditable) {
        event.preventDefault();
        handlers.onNewConversation();
        return;
      }

      // Mod+K: Command palette
      if (isMod && event.key === 'k') {
        event.preventDefault();
        handlers.onTogglePalette();
        return;
      }

      // Mod+,: Settings
      if (isMod && event.key === ',') {
        event.preventDefault();
        handlers.onOpenSettings();
        return;
      }

      // Mod+B: Conversations drawer
      if (isMod && event.key === 'b') {
        event.preventDefault();
        handlers.onToggleConversations();
        return;
      }

      // Escape: Close most recent overlay or stop generation
      if (event.key === 'Escape') {
        handlers.onEscape();
        return;
      }

      // /: Focus composer (only when not in editable)
      if (event.key === '/' && !isEditable) {
        event.preventDefault();
        handlers.focusComposer();
        return;
      }

      // ↑: Load last user message when composer is focused and empty
      if (event.key === 'ArrowUp' && isEditable) {
        if (target instanceof HTMLTextAreaElement && target.value === '') {
          event.preventDefault();
          handlers.loadLastUserMessage();
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlers]);
}
