import { useEffect } from 'react';
import { useSettings } from './hooks/useSettings';
import { hasAuthenticatedAccount } from './hooks/useSyncManager';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';

export default function App() {
  const { settings, saveSettings } = useSettings();
  const themeName = settings.darkMode ? 'dark' : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = themeName;
    document.documentElement.classList.toggle('dark', settings.darkMode);
    document.documentElement.style.colorScheme = themeName;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', settings.darkMode ? '#08111f' : '#edf6fb');
  }, [settings.darkMode, themeName]);

  if (!hasAuthenticatedAccount(settings)) {
    return (
      <AuthPage
        settings={settings}
        themeName={themeName}
        onAuthSuccess={saveSettings}
      />
    );
  }

  return (
    <ChatPage
      settings={settings}
      themeName={themeName}
      onSettingsChange={saveSettings}
    />
  );
}
