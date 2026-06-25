import { useEffect, useState } from 'react';

export interface UseDrawersReturn {
  isConversationDrawerOpen: boolean;
  isSettingsDrawerOpen: boolean;
  openConversationDrawer: () => void;
  openSettingsDrawer: () => void;
  closeDrawers: () => void;
}

const DESKTOP_BREAKPOINT_QUERY = '(min-width: 1024px)';

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

  // Lock body scroll while a drawer is open on mobile (sub-`lg`).
  // Uses the iOS-safe fixed-position pattern so the page doesn't snap to top
  // and rubber-band scrolling on the underlay is suppressed.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const isAnyDrawerOpen = isConversationDrawerOpen || isSettingsDrawerOpen;

    if (!isAnyDrawerOpen) {
      return;
    }

    const body = document.body;
    let savedScrollY = 0;
    let savedStyles: Partial<CSSStyleDeclaration> = {};
    let isLocked = false;

    function isDesktopViewport() {
      // jsdom and other non-browser environments don't ship matchMedia. Treat
      // missing support as desktop so tests don't pin the body in place.
      if (typeof window.matchMedia !== 'function') {
        return true;
      }
      return window.matchMedia(DESKTOP_BREAKPOINT_QUERY).matches;
    }

    function lock() {
      if (isLocked) {
        return;
      }
      savedScrollY = window.scrollY;
      savedStyles = {
        position: body.style.position,
        top: body.style.top,
        width: body.style.width,
        overflow: body.style.overflow
      };
      body.style.position = 'fixed';
      body.style.top = `${-savedScrollY}px`;
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      isLocked = true;
    }

    function unlock() {
      if (!isLocked) {
        return;
      }
      body.style.position = savedStyles.position ?? '';
      body.style.top = savedStyles.top ?? '';
      body.style.width = savedStyles.width ?? '';
      body.style.overflow = savedStyles.overflow ?? '';
      window.scrollTo(0, savedScrollY);
      isLocked = false;
    }

    function applyForViewport() {
      if (isDesktopViewport()) {
        unlock();
      } else {
        lock();
      }
    }

    applyForViewport();

    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia(DESKTOP_BREAKPOINT_QUERY)
      : null;
    const handleViewportChange = () => applyForViewport();

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleViewportChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleViewportChange);
      }
    }
    window.addEventListener('resize', handleViewportChange);

    return () => {
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleViewportChange);
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(handleViewportChange);
        }
      }
      window.removeEventListener('resize', handleViewportChange);
      unlock();
    };
  }, [isConversationDrawerOpen, isSettingsDrawerOpen]);

  return {
    isConversationDrawerOpen,
    isSettingsDrawerOpen,
    openConversationDrawer,
    openSettingsDrawer,
    closeDrawers
  };
}
