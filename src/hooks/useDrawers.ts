import { useState } from 'react';

export interface UseDrawersReturn {
  isConversationDrawerOpen: boolean;
  isSettingsDrawerOpen: boolean;
  openConversationDrawer: () => void;
  openSettingsDrawer: () => void;
  closeDrawers: () => void;
}

export function useDrawers(): UseDrawersReturn {
  const [isConversationDrawerOpen, setIsConversationDrawerOpen] = useState(false);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

  function openConversationDrawer() {
    setIsSettingsDrawerOpen(false);
    setIsConversationDrawerOpen(true);
  }

  function openSettingsDrawer() {
    setIsConversationDrawerOpen(false);
    setIsSettingsDrawerOpen(true);
  }

  function closeDrawers() {
    setIsConversationDrawerOpen(false);
    setIsSettingsDrawerOpen(false);
  }

  return {
    isConversationDrawerOpen,
    isSettingsDrawerOpen,
    openConversationDrawer,
    openSettingsDrawer,
    closeDrawers
  };
}
