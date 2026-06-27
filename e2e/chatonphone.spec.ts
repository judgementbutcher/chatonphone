import { expect, test, type Page } from '@playwright/test';

const authenticatedSettings = {
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  temperature: 0.7,
  maxTokens: 2048,
  stream: true,
  requestMode: 'proxy',
  proxyUrl: '',
  proxyAccessToken: '',
  providers: [
    {
      id: 'default',
      name: '默认供应商',
      apiBaseUrl: '',
      apiKey: '',
      requestMode: 'proxy',
      proxyUrl: '',
      proxyAccessToken: '',
      models: []
    }
  ],
  selectedProviderId: 'default',
  selectedModel: '',
  darkMode: false,
  syncAccount: {
    endpoint: '',
    accountId: 'desktop-user',
    accessToken: 'saved-token',
    autoSync: true
  }
};

async function openAuthenticatedApp(page: Page) {
  await page.route('**/sync/settings/desktop-user', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      status: 404,
      body: JSON.stringify({ error: 'Settings not found' })
    });
  });
  await page.addInitScript((settings) => {
    localStorage.setItem('chatonphone.settings.v1', JSON.stringify(settings));
  }, authenticatedSettings);
  await page.goto('/');
}

test('android-sized user can configure api and type a message', async ({ page }) => {
  await page.route('**/v1/models', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'vision-model' }] })
    });
  });
  await openAuthenticatedApp(page);

  await expect(page.getByRole('heading', { name: 'ChatOnPhone' })).toBeVisible();
  await page.getByRole('button', { name: '打开设置' }).click();
  await page.getByLabel('API Base URL').fill('https://gateway.example.com/v1');
  await page.getByLabel('API Key').fill('secret');
  await page.getByRole('button', { name: '拉取模型' }).click();
  await expect(page.getByLabel('默认聊天模型')).toHaveValue('vision-model');
  const settingsCenter = page.locator('#settings-center');
  await expect(settingsCenter).toBeVisible();
  expect(await settingsCenter.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByLabel('快捷模型')).toHaveValue('vision-model');
  await page.getByLabel('消息内容').fill('你好');

  await expect(page.getByRole('button', { name: '发送' })).toBeEnabled();
});

test('android-sized user can upload a text file', async ({ page }) => {
  await openAuthenticatedApp(page);

  await page.getByLabel('选择文件').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Notes\nUse this context.')
  });
  await page.getByRole('button', { name: '发送' }).click();

  const fileCard = page.locator('.messageFile').filter({ hasText: 'notes.md' });
  await expect(page.getByText('notes.md')).toBeVisible();
  await expect(page.getByText('25 B')).toBeVisible();
  await expect(fileCard).toBeVisible();
  expect(await fileCard.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});
