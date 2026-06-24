import { LogIn, MessageSquare, ShieldCheck, UserPlus } from 'lucide-react';
import type { AppSettings } from '../domain/types';
import { useAuth } from '../hooks/useAuth';
import { useSyncManager } from '../hooks/useSyncManager';
import { uploadSyncedSettings, downloadSyncedSettings } from '../sync/settingsSync';

interface AuthPageProps {
  settings: AppSettings;
  themeName: string;
  onAuthSuccess: (settings: AppSettings) => void;
}

export default function AuthPage({ settings, themeName, onAuthSuccess }: AuthPageProps) {
  const auth = useAuth(settings.syncAccount?.accountId ?? '');
  const sync = useSyncManager();

  async function handleAuthSubmit(action: 'register' | 'login') {
    const account = await auth.handleAuth(action, settings);

    if (!account) {
      return;
    }

    const accountSettings = {
      ...settings,
      syncAccount: account
    };

    sync.markAccountSynced(accountSettings, true);

    if (action === 'register') {
      try {
        await uploadSyncedSettings(accountSettings);
        sync.setSyncStatus('账号已注册并上传同步');
        onAuthSuccess(accountSettings);
      } catch {
        auth.setAuthError('注册成功但同步失败，请重新登录。');
      }
      return;
    }

    try {
      const downloadedSettings = await downloadSyncedSettings(account, accountSettings);
      const mergedSettings = {
        ...downloadedSettings,
        syncAccount: account
      };
      sync.markAccountSynced(mergedSettings, true);
      sync.setSyncStatus('已登录并同步');
      onAuthSuccess(mergedSettings);
    } catch {
      sync.setSyncStatus('已登录（无远端设置）');
      onAuthSuccess(accountSettings);
    }
  }

  return (
    <main className="auth-shell" data-theme={themeName}>
      <section className="auth-panel animate-fade-up overflow-hidden rounded-[1.6rem]">
        <div className="soft-divider-bottom bg-card/[0.32] px-6 py-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[0_14px_34px_hsl(var(--primary)/0.28)]">
              <MessageSquare aria-hidden="true" size={23} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.04em]">ChatOnPhone</h1>
              <p className="mt-1 text-sm text-muted-foreground">OpenAI-compatible mobile chat console</p>
            </div>
          </div>
        </div>

        <form
          className="space-y-5 px-6 py-6 sm:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAuthSubmit('login');
          }}
        >
          <div>
            <h2 className="text-lg font-semibold tracking-normal">登录或注册</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              使用同步账号进入聊天应用，设置会在登录后自动恢复。
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">账号</span>
            <input
              value={auth.authAccountId}
              autoComplete="username"
              onChange={(event) => auth.setAuthAccountId(event.target.value)}
              className="tech-control h-11 w-full rounded-full px-3.5 text-sm outline-none"
              placeholder="desktop-user"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">登录密码</span>
            <input
              value={auth.authPassword}
              type="password"
              autoComplete="current-password"
              onChange={(event) => auth.setAuthPassword(event.target.value)}
              className="tech-control h-11 w-full rounded-full px-3.5 text-sm outline-none"
              placeholder="输入密码"
            />
          </label>

          {auth.authError && (
            <div className="danger-action rounded-[1rem] px-3 py-2.5 text-sm" role="alert">
              {auth.authError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="soft-action inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-55"
              disabled={auth.isAuthenticating}
              onClick={() => void handleAuthSubmit('register')}
            >
              <UserPlus aria-hidden="true" size={17} strokeWidth={2.25} />
              注册
            </button>
            <button
              type="submit"
              className="primary-action inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-55"
              disabled={auth.isAuthenticating}
            >
              <LogIn aria-hidden="true" size={17} strokeWidth={2.25} />
              登录
            </button>
          </div>

          <div className="chip flex items-start gap-3 rounded-[1rem] px-3 py-3 text-sm leading-6 text-muted-foreground">
            <ShieldCheck aria-hidden="true" size={18} strokeWidth={2.15} className="mt-0.5 shrink-0 text-primary" />
            <span>账号仅用于同步本机连接配置和偏好，聊天记录仍保存在当前设备。</span>
          </div>
        </form>
      </section>
    </main>
  );
}
