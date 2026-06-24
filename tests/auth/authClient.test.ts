import { describe, expect, it, vi } from 'vitest';
import { loginAccount, registerAccount } from '../../src/auth/authClient';

describe('auth client', () => {
  it('registers an account at the configured endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'desktop-user',
      accessToken: 'issued-token'
    }), { status: 201 }));

    const account = await registerAccount({
      endpoint: 'https://chat.example.com',
      accountId: 'desktop-user',
      password: 'correct horse battery staple',
      autoSync: true
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://chat.example.com/auth/register', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        accountId: 'desktop-user',
        password: 'correct horse battery staple'
      })
    }));
    expect(account).toEqual({
      endpoint: 'https://chat.example.com',
      accountId: 'desktop-user',
      accessToken: 'issued-token',
      autoSync: true
    });
  });

  it('registers against the current app origin when no endpoint is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'desktop-user',
      accessToken: 'issued-token'
    }), { status: 201 }));

    await expect(registerAccount({
      endpoint: '',
      accountId: 'desktop-user',
      password: 'correct horse battery staple',
      autoSync: true
    }, fetchImpl)).resolves.toMatchObject({
      endpoint: '',
      accountId: 'desktop-user',
      accessToken: 'issued-token'
    });
    expect(fetchImpl).toHaveBeenCalledWith('/auth/register', expect.any(Object));
  });

  it('logs in an account at the configured endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'desktop-user',
      accessToken: 'login-token'
    }), { status: 200 }));

    const account = await loginAccount({
      endpoint: 'https://chat.example.com/',
      accountId: 'desktop-user',
      password: 'correct horse battery staple',
      autoSync: false
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://chat.example.com/auth/login', expect.any(Object));
    expect(account).toMatchObject({
      endpoint: 'https://chat.example.com/',
      accountId: 'desktop-user',
      accessToken: 'login-token',
      autoSync: false
    });
  });

  it('throws unsuccessful auth responses', async () => {
    const response = new Response('Unauthorized', { status: 401 });
    const fetchImpl = vi.fn().mockResolvedValue(response);

    await expect(loginAccount({
      endpoint: '',
      accountId: 'desktop-user',
      password: 'wrong password',
      autoSync: true
    }, fetchImpl)).rejects.toBe(response);
  });
});
