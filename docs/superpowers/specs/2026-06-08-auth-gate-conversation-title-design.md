# ChatOnPhone Auth Gate and Conversation Title Design

## Goal

Visitors must register or log in before using ChatOnPhone. Once authenticated, the existing sync account token becomes the app login state. New conversations should receive a useful title from the first user message instead of remaining as "新会话".

## Current Behavior

- The app renders the chat shell immediately on first visit.
- Register and login are only available inside the settings drawer as account sync actions.
- A saved sync account token is already persisted in `syncAccount.accessToken`.
- Every new conversation starts with the fixed title "新会话" and autosave keeps that title unless the user manually renames it.

## Proposed Approach

Use the existing sync account as the single account system:

- If `syncAccount.accessToken.trim()` exists, render the chat application.
- If no token exists, render an auth screen with account, password, register, login, error, and loading states.
- Registration calls `/auth/register`, persists the returned account, uploads the current settings, then enters the app.
- Login calls `/auth/login`, persists the returned account, downloads synced settings, then enters the app.
- The settings panel keeps its current account sync controls for account maintenance and existing tests, but normal first-run access starts at the auth screen.

This keeps the implementation small and avoids introducing a second login model.

## Conversation Titles

Add a title derivation helper near conversation creation:

- Use the first user message text after trimming and collapsing whitespace.
- Limit the title to a compact sidebar length.
- Use "文件对话" when the first user message has attachments but no text.
- Keep "新会话" only until there is enough content to name the conversation.
- Do not override a title that is already different from the default, preserving manual renames and imported conversation titles.

The autosave path should apply this helper when saving active conversation snapshots, so the sidebar and stored conversation update together.

## Error Handling

- Auth failures reuse `classifyChatError` and show a readable Chinese error on the auth screen.
- Auth submit buttons are disabled while a request is running.
- Chat UI remains inaccessible while unauthenticated.
- Existing settings sync failures continue to use the current error banner.

## Tests

Add or update tests for:

- Unauthenticated visitors see only the auth screen and cannot access chat controls.
- Registering from the auth screen saves the account and enters the app.
- Logging in from the auth screen downloads settings and enters the app.
- A first user message renames the conversation from "新会话" to a derived title.
- Manual or existing non-default conversation titles are not overwritten.

Run `npm test`, `npm run build`, and `git diff --check` before syncing to the VPS.
