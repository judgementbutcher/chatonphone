import { describe, expect, it } from 'vitest';
import { classifyChatError } from '../../src/domain/errors';

describe('classifyChatError', () => {
  it('classifies CORS-like browser fetch failures', () => {
    expect(classifyChatError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'cors-or-network',
      title: '浏览器请求失败',
      detail: '直连可能被 CORS 或网络状态拦截，请检查网络或切换代理模式。'
    });
  });

  it('classifies unauthorized responses', () => {
    expect(classifyChatError(new Response('Unauthorized', { status: 401 }))).toMatchObject({
      kind: 'auth',
      title: 'API Key 无效'
    });
  });
});
