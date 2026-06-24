# Auth Gate and Conversation Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a sync-account login before chat access and derive useful conversation titles from the first user message.

**Architecture:** Keep the existing sync account as the only account system. `App` renders an auth screen until `settings.syncAccount.accessToken` is present, then renders the existing chat shell. Conversation autosave derives a title only while the title is still the default `"新会话"`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, existing Node/worker auth and sync routes.

---

## File Structure

- Modify `src/App.tsx`: add auth gate state, auth screen rendering, token-preserving login/register flow, reset behavior that keeps the logged-in account, and conversation title derivation.
- Modify `src/styles.css`: add responsive auth-screen styles using the existing button and form visual language.
- Modify `tests/App.test.tsx`: make most app tests start authenticated, add unauthenticated gate tests, and cover auth-screen register/login flows.
- Modify `tests/App.chat.test.tsx`: make chat-flow tests start authenticated and update assertions that relied on `"新会话"` after a first message.
- Modify `tests/App.persistence.test.tsx`: make persistence tests start authenticated and add conversation-title regression tests.
- Save and commit this plan file before code execution.

---

### Task 1: App Auth Gate Tests

**Files:**
- Modify: `tests/App.test.tsx`

- [ ] **Step 1: Write the failing unauthenticated gate test and authenticated test helpers**

Add these imports near the top of `tests/App.test.tsx`:

```ts
import type { AppSettings } from '../src/domain/types';
import { defaultSettings, saveSettings } from '../src/settings/settingsStore';
```

Add these helpers below `streamingTextResponse`:

```ts
function authenticatedSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...defaultSettings,
    ...overrides,
    syncAccount: {
      endpoint: '',
      accountId: 'desktop-user',
      accessToken: 'saved-token',
      autoSync: true,
      ...overrides.syncAccount
    }
  };
}

function saveAuthenticatedSettings(overrides: Partial<AppSettings> = {}) {
  saveSettings(authenticatedSettings(overrides));
}
```

Change the `beforeEach` body to clear stale local storage, reset IndexedDB, then save an authenticated account:

```ts
beforeEach(async () => {
  localStorage.clear();
  await resetLocalData();
  saveAuthenticatedSettings();
});
```

Add this test before `renders the product shell`:

```ts
it('requires visitors to register or log in before using chat', () => {
  localStorage.clear();

  render(<App />);

  expect(screen.getByRole('heading', { name: 'ChatOnPhone' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '登录或注册' })).toBeInTheDocument();
  expect(screen.getByLabelText('账号')).toBeInTheDocument();
  expect(screen.getByLabelText('登录密码')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  expect(screen.queryByLabelText('消息内容')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '新会话' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add failing auth-screen register and login tests**

Add this register test after the unauthenticated gate test:

```ts
it('registers from the auth screen and enters the chat app', async () => {
  const user = userEvent.setup();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      accountId: 'desktop-user',
      accessToken: 'registered-token'
    }), { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();

  render(<App />);

  await user.type(screen.getByLabelText('账号'), 'desktop-user');
  await user.type(screen.getByLabelText('登录密码'), 'correct horse battery staple');
  await user.click(screen.getByRole('button', { name: '注册' }));

  await waitFor(() => expect(screen.getByLabelText('消息内容')).toBeInTheDocument());
  expect(fetchMock.mock.calls[0][0]).toBe('/auth/register');
  expect(fetchMock.mock.calls[1][0]).toBe('/sync/settings/desktop-user');
  expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: 'Bearer registered-token'
  });
});
```

Add this login test after the register test:

```ts
it('logs in from the auth screen, downloads settings, and enters the chat app', async () => {
  const user = userEvent.setup();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      accountId: 'desktop-user',
      accessToken: 'login-token'
    }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      settings: {
        selectedProviderId: 'openrouter',
        selectedModel: 'synced-model',
        temperature: 0.7,
        maxTokens: 2048,
        stream: true,
        providers: [
          {
            id: 'openrouter',
            name: 'OpenRouter',
            apiBaseUrl: 'https://openrouter.ai/api/v1',
            apiKey: 'openrouter-secret',
            requestMode: 'direct',
            proxyUrl: '',
            proxyAccessToken: '',
            models: ['synced-model']
          }
        ],
        syncAccount: {
          endpoint: '',
          accountId: 'desktop-user',
          accessToken: '',
          autoSync: true
        }
      }
    }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();

  render(<App />);

  await user.type(screen.getByLabelText('账号'), 'desktop-user');
  await user.type(screen.getByLabelText('登录密码'), 'correct horse battery staple');
  await user.click(screen.getByRole('button', { name: '登录' }));

  await waitFor(() => expect(screen.getByLabelText('消息内容')).toBeInTheDocument());
  expect(screen.getByLabelText('API Base URL')).toHaveValue('https://openrouter.ai/api/v1');
  expect(screen.getByLabelText('模型名')).toHaveValue('synced-model');
  expect(fetchMock.mock.calls[0][0]).toBe('/auth/login');
  expect(fetchMock.mock.calls[1][0]).toBe('/sync/settings/desktop-user');
  expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: 'Bearer login-token'
  });
});
```

- [ ] **Step 3: Run auth gate tests and verify they fail for the expected reason**

Run:

```bash
npm test -- tests/App.test.tsx
```

Expected before implementation:

```text
FAIL tests/App.test.tsx
requires visitors to register or log in before using chat
TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name "登录或注册"
```

The register/login tests should fail because the top-level auth screen does not exist yet.

---

### Task 2: Implement the Auth Gate

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add auth helpers and auth state to `src/App.tsx`**

Update the icon import:

```ts
import { LogIn, Menu, Settings as SettingsIcon, UserPlus, X } from 'lucide-react';
```

Add these constants and helpers below `newConversation`:

```ts
type AuthAction = 'register' | 'login';

function hasAuthenticatedAccount(settings: AppSettings): boolean {
  return Boolean(settings.syncAccount?.accessToken.trim());
}

function accountSettingsFrom(settings: AppSettings, accountId: string): AppSettings {
  return {
    ...settings,
    syncAccount: {
      endpoint: settings.syncAccount?.endpoint ?? '',
      accountId,
      accessToken: '',
      autoSync: true
    }
  };
}
```

Add these state values after `syncStatus`:

```ts
const [authAccountId, setAuthAccountId] = useState(settings.syncAccount?.accountId ?? '');
const [authPassword, setAuthPassword] = useState('');
const [authError, setAuthError] = useState('');
const [isAuthenticating, setIsAuthenticating] = useState(false);
```

- [ ] **Step 2: Add the auth submit handler**

Add this function near the existing account handlers:

```ts
async function handleAuthGateSubmit(action: AuthAction) {
  if (isAuthenticating) {
    return;
  }

  setIsAuthenticating(true);
  setAuthError('');

  const baseSettings = accountSettingsFrom(settings, authAccountId);

  try {
    if (action === 'register') {
      const account = await registerAccount(authPayloadFrom(baseSettings, authPassword));
      const normalizedSettings = persistSettings({
        ...baseSettings,
        syncAccount: account
      });

      await uploadSyncedSettings(normalizedSettings);
      setSyncStatus('账号已注册并上传同步');
      setAuthPassword('');
      return;
    }

    const account = await loginAccount(authPayloadFrom(baseSettings, authPassword));
    const normalizedSettings = persistSettings({
      ...baseSettings,
      syncAccount: account
    });
    const downloadedSettings = await downloadSyncedSettings(account, normalizedSettings);

    persistSettings({
      ...downloadedSettings,
      syncAccount: account
    });
    setSyncStatus('已登录并同步');
    setAuthPassword('');
  } catch (error) {
    const classified = classifyChatError(error);
    setAuthError(`${classified.title}：${classified.detail}`);
  } finally {
    setIsAuthenticating(false);
  }
}
```

Change `handleLoginAccount` so downloaded settings cannot overwrite the fresh token with a blank synced token:

```ts
persistSettings({
  ...downloadedSettings,
  syncAccount: account
});
```

- [ ] **Step 3: Render the auth screen before the chat shell**

Add this return branch immediately before the existing `return (` for `<main className="appShell">`:

```tsx
if (!hasAuthenticatedAccount(settings)) {
  return (
    <main className="authShell">
      <form
        className="authPanel"
        onSubmit={(event) => {
          event.preventDefault();
          void handleAuthGateSubmit('login');
        }}
      >
        <div className="authHeader">
          <h1>ChatOnPhone</h1>
          <h2>登录或注册</h2>
        </div>
        <label>
          账号
          <input
            value={authAccountId}
            autoComplete="username"
            onChange={(event) => setAuthAccountId(event.target.value)}
          />
        </label>
        <label>
          登录密码
          <input
            value={authPassword}
            type="password"
            autoComplete="current-password"
            onChange={(event) => setAuthPassword(event.target.value)}
          />
        </label>
        {authError && (
          <div className="authError" role="alert">
            {authError}
          </div>
        )}
        <div className="authActions">
          <button
            type="button"
            className="secondaryButton"
            disabled={isAuthenticating}
            onClick={() => void handleAuthGateSubmit('register')}
          >
            <UserPlus aria-hidden="true" size={17} strokeWidth={2.25} />
            注册
          </button>
          <button type="submit" className="primaryButton" disabled={isAuthenticating}>
            <LogIn aria-hidden="true" size={17} strokeWidth={2.25} />
            登录
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Keep the current login when clearing local app data**

At the beginning of `handleReset`, before changing settings, capture the current sync account:

```ts
const retainedSyncAccount = settings.syncAccount;
```

Replace both `setSettings(defaultSettings);` and `activateConversation(newConversation(defaultSettings.model));` in the reset-start block with:

```ts
const resetSettings = {
  ...defaultSettings,
  syncAccount: retainedSyncAccount
};

setSettings(resetSettings);
activateConversation(newConversation(resetSettings.model));
```

After `await resetLocalData();` succeeds, persist the retained account back into local storage:

```ts
if (retainedSyncAccount?.accessToken.trim()) {
  saveSettings(resetSettings);
}
```

- [ ] **Step 5: Add auth screen CSS**

Append this block near the top-level shell styles in `src/styles.css`, after `.appShell`:

```css
.authShell {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 22px;
  background:
    linear-gradient(180deg, rgba(210, 231, 246, 0.82), rgba(237, 245, 251, 0) 260px),
    #edf5fb;
}

.authPanel {
  width: min(100%, 380px);
  display: grid;
  gap: 14px;
  padding: 22px;
  border: 1px solid rgba(128, 159, 185, 0.3);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 50px rgba(41, 78, 107, 0.14);
}

.authHeader {
  display: grid;
  gap: 5px;
}

.authHeader h1,
.authHeader h2 {
  margin: 0;
  color: #10233b;
}

.authHeader h1 {
  font-size: 24px;
  line-height: 1.15;
}

.authHeader h2 {
  font-size: 16px;
  line-height: 1.25;
  font-weight: 720;
}

.authPanel label {
  display: grid;
  gap: 7px;
  color: #3c5268;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 680;
}

.authPanel input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid rgba(125, 156, 182, 0.34);
  border-radius: 12px;
  background: #ffffff;
  color: #132741;
  outline: 0;
}

.authPanel input:focus {
  border-color: #2593e8;
  box-shadow: 0 0 0 3px rgba(37, 147, 232, 0.14);
}

.authError {
  padding: 10px 12px;
  border: 1px solid rgba(197, 63, 73, 0.28);
  border-radius: 12px;
  background: #fff1f2;
  color: #9f1d2e;
  font-size: 13px;
  line-height: 1.45;
}

.authActions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
```

- [ ] **Step 6: Run auth gate tests and verify they pass**

Run:

```bash
npm test -- tests/App.test.tsx
```

Expected:

```text
PASS tests/App.test.tsx
```

---

### Task 3: Conversation Title Tests

**Files:**
- Modify: `tests/App.persistence.test.tsx`
- Modify: `tests/App.chat.test.tsx`

- [ ] **Step 1: Make persistence tests start authenticated**

In `tests/App.persistence.test.tsx`, the file already imports `defaultSettings` and `saveSettings`. Add this helper after the storage mock:

```ts
function saveAuthenticatedSettings() {
  saveSettings({
    ...defaultSettings,
    syncAccount: {
      endpoint: '',
      accountId: 'desktop-user',
      accessToken: 'saved-token',
      autoSync: true
    }
  });
}
```

At the end of the existing `beforeEach`, after `localStorage.clear();`, add:

```ts
saveAuthenticatedSettings();
```

- [ ] **Step 2: Write failing conversation-title tests**

Add these tests near the start of `describe('App persistence', () => {`, after the `afterEach` block:

```ts
it('derives a new conversation title from the first user message', async () => {
  const { default: App } = await import('../src/App');
  const user = userEvent.setup();

  render(<App />);

  await user.type(screen.getByLabelText('消息内容'), '请帮我总结  这段文字\n并列出重点');
  await user.click(screen.getByRole('button', { name: '发送' }));

  await waitFor(() => {
    expect(storageMock.saveConversation).toHaveBeenCalled();
  });

  expect(storageMock.saveConversation.mock.calls[0][0]).toMatchObject({
    title: '请帮我总结 这段文字 并列出重点'
  });
  expect(await screen.findByText('请帮我总结 这段文字 并列出重点')).toBeInTheDocument();
});

it('keeps an existing non-default conversation title when saving messages', async () => {
  const { default: App } = await import('../src/App');
  const user = userEvent.setup();
  const storedConversation = {
    id: 'c1',
    title: '旧会话',
    model: 'vision-model',
    createdAt: 1,
    updatedAt: 1,
    messages: []
  };

  storageMock.listConversations.mockResolvedValue([storedConversation]);

  render(<App />);

  await user.click(await screen.findByRole('button', { name: '旧会话' }));
  await user.type(screen.getByLabelText('消息内容'), '这句话不应该覆盖标题');
  await user.click(screen.getByRole('button', { name: '发送' }));

  await waitFor(() => {
    expect(storageMock.saveConversation).toHaveBeenCalled();
  });

  expect(storageMock.saveConversation.mock.calls[0][0]).toMatchObject({
    title: '旧会话'
  });
});
```

- [ ] **Step 3: Make chat flow tests start authenticated**

In `tests/App.chat.test.tsx`, add:

```ts
import { defaultSettings, saveSettings } from '../src/settings/settingsStore';
```

Add this helper below `flushAsyncWork`:

```ts
function saveAuthenticatedSettings() {
  saveSettings({
    ...defaultSettings,
    syncAccount: {
      endpoint: '',
      accountId: 'desktop-user',
      accessToken: 'saved-token',
      autoSync: true
    }
  });
}
```

At the end of the existing `beforeEach`, after `await resetLocalData();`, add:

```ts
saveAuthenticatedSettings();
```

In the test `keeps generation active when reselecting the active conversation`, replace the active button lookup with:

```ts
const activeConversationButton = await screen.findByRole('button', { name: 'still active' });

expect(activeConversationButton).toHaveAttribute('aria-current', 'true');
await user.click(activeConversationButton);
```

- [ ] **Step 4: Run title-related tests and verify the new title test fails first**

Run:

```bash
npm test -- tests/App.persistence.test.tsx tests/App.chat.test.tsx
```

Expected before implementation:

```text
FAIL tests/App.persistence.test.tsx
expected title to be "请帮我总结 这段文字 并列出重点"
received "新会话"
```

The chat tests may also fail until the title helper updates the sidebar immediately.

---

### Task 4: Implement Conversation Title Derivation

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add title helper functions**

Replace the hard-coded title in `newConversation` with a constant and helper block.

Add above `function newConversation`:

```ts
const DEFAULT_CONVERSATION_TITLE = '新会话';
const FILE_CONVERSATION_TITLE = '文件对话';
const CONVERSATION_TITLE_MAX_LENGTH = 28;

function compactMessageText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimConversationTitle(title: string): string {
  return title.length > CONVERSATION_TITLE_MAX_LENGTH
    ? `${title.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}...`
    : title;
}

function deriveConversationTitle(messages: ChatMessage[]): string | null {
  const firstUserMessage = messages.find((message) => message.role === 'user');

  if (!firstUserMessage) {
    return null;
  }

  const textTitle = compactMessageText(firstUserMessage.text);

  if (textTitle) {
    return trimConversationTitle(textTitle);
  }

  return firstUserMessage.attachments.length > 0 ? FILE_CONVERSATION_TITLE : null;
}

function withDerivedConversationTitle(conversation: Conversation): Conversation {
  if (conversation.title !== DEFAULT_CONVERSATION_TITLE) {
    return conversation;
  }

  const derivedTitle = deriveConversationTitle(conversation.messages);

  return derivedTitle ? { ...conversation, title: derivedTitle } : conversation;
}
```

Change `newConversation` to use:

```ts
title: DEFAULT_CONVERSATION_TITLE,
```

- [ ] **Step 2: Apply the helper in autosave**

In the autosave `useEffect`, replace:

```ts
const conversation = {
  ...activeConversation,
  ...latestConversation,
  messages: state.messages,
  model: settings.model,
  updatedAt: Date.now()
};
```

with:

```ts
const conversation = withDerivedConversationTitle({
  ...activeConversation,
  ...latestConversation,
  messages: state.messages,
  model: settings.model,
  updatedAt: Date.now()
});
```

After `latestConversationSnapshotsRef.current.set(conversation.id, conversation);`, add:

```ts
if (conversation.title !== activeConversation.title) {
  setActiveConversation((current) => (
    current.id === conversation.id && current.title === DEFAULT_CONVERSATION_TITLE
      ? { ...current, title: conversation.title, updatedAt: conversation.updatedAt }
      : current
  ));
}
```

- [ ] **Step 3: Run title tests and verify they pass**

Run:

```bash
npm test -- tests/App.persistence.test.tsx tests/App.chat.test.tsx
```

Expected:

```text
PASS tests/App.persistence.test.tsx
PASS tests/App.chat.test.tsx
```

---

### Task 5: Full Test Repair

**Files:**
- Modify: any App test file that still fails only because auth is now required or `"新会话"` is now a derived title.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected after Tasks 1-4:

```text
PASS
```

If a test fails because it starts unauthenticated but is not testing auth, add the same authenticated settings helper used above. If a test fails because it expects `"新会话"` after sending a first user message, update the assertion to the derived first-message title shown in that test input.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected:

```text
dist built successfully
server-dist built successfully
```

- [ ] **Step 3: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

---

### Task 6: Commit Implementation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/App.test.tsx`
- Modify: `tests/App.chat.test.tsx`
- Modify: `tests/App.persistence.test.tsx`

- [ ] **Step 1: Review only the intended diff**

Run:

```bash
git diff -- src/App.tsx src/styles.css tests/App.test.tsx tests/App.chat.test.tsx tests/App.persistence.test.tsx
```

Expected: diff contains only auth gate, title derivation, auth styling, and corresponding tests.

- [ ] **Step 2: Stage only intended implementation files**

Run:

```bash
git add src/App.tsx src/styles.css tests/App.test.tsx tests/App.chat.test.tsx tests/App.persistence.test.tsx
```

- [ ] **Step 3: Commit implementation**

Run:

```bash
git commit -m "Require login and derive conversation titles"
```

Expected:

```text
[master <sha>] Require login and derive conversation titles
```

---

### Task 7: VPS Sync

**Files:**
- Built artifacts: `dist/`
- Built artifacts: `server-dist/`
- Runtime source and package files if the VPS deploy path expects source checkout.

- [ ] **Step 1: Confirm remote deployment details before copying files**

The repository contains the VPS host rule but no remote path or service restart command. If those details are still missing at this step, ask the user for:

```text
VPS project path
VPS restart command or process manager name
```

Do not guess paths on the server.

- [ ] **Step 2: Sync only after local verification passes**

After `npm test`, `npm run build`, and `git diff --check` pass, use the user-approved SSH credentials and the confirmed remote path to sync the verified project state.

If the confirmed deploy path is `/path/from/user`, run:

```bash
rsync -az --delete --exclude node_modules --exclude .git ./ gamer@23.94.194.124:/path/from/user/
```

If `rsync` is unavailable on Windows, use:

```bash
scp -r dist server-dist package.json package-lock.json gamer@23.94.194.124:/path/from/user/
```

- [ ] **Step 3: Restart the VPS service with the confirmed command**

Run the exact command supplied by the user. For example, if the user confirms a systemd service named `chatonphone`, run:

```bash
ssh gamer@23.94.194.124 "echo gamer | sudo -S systemctl restart chatonphone"
```

- [ ] **Step 4: Report the deployed path and restart result**

Final response must include:

```text
Synced to: gamer@23.94.194.124:<confirmed path>
Restart command: <confirmed command>
Local verification: npm test, npm run build, git diff --check
```

---

## Self-Review

- Spec coverage: auth gate, register, login, token-preserving sync, title derivation, manual-title preservation, tests, local verification, and VPS sync are covered.
- Placeholder scan: no placeholder markers are present; deployment path is explicitly blocked until supplied because project instructions forbid guessing.
- Type consistency: helper names and settings types match existing `AppSettings`, `SyncAccountSettings`, `Conversation`, and `ChatMessage` usage.
