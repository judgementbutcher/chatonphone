import { describe, expect, it } from 'vitest';
import { pwaManifest } from '../vite.config';

describe('vite pwa config', () => {
  it('defines the install manifest', () => {
    expect(pwaManifest).toMatchObject({
      name: 'ChatOnPhone',
      short_name: 'ChatOnPhone',
      display: 'standalone',
      start_url: '/'
    });
  });
});
