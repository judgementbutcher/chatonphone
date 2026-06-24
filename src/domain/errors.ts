export type ChatErrorKind =
  | 'auth'
  | 'cors-or-network'
  | 'base-url'
  | 'model-image'
  | 'image-size'
  | 'rate-limit'
  | 'unknown';

export interface ClassifiedChatError {
  kind: ChatErrorKind;
  title: string;
  detail: string;
}

export function classifyChatError(error: unknown): ClassifiedChatError {
  if (error instanceof Response) {
    if (error.status === 401 || error.status === 403) {
      return {
        kind: 'auth',
        title: 'API Key 无效',
        detail: '请检查设置里的 API Key，确认它仍然可用。'
      };
    }

    if (error.status === 404) {
      return {
        kind: 'base-url',
        title: '接口地址不可用',
        detail: '请检查 API Base URL 是否包含正确的 /v1 路径。'
      };
    }

    if (error.status === 413) {
      return {
        kind: 'image-size',
        title: '文件过大',
        detail: '请减少文件数量、降低图片尺寸或缩短文本文件后重试。'
      };
    }

    if (error.status === 429) {
      return {
        kind: 'rate-limit',
        title: '请求过于频繁',
        detail: '中转站返回限流，请稍后再试。'
      };
    }
  }

  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return {
      kind: 'cors-or-network',
      title: '浏览器请求失败',
      detail: '直连可能被 CORS 或网络状态拦截，请检查网络或切换代理模式。'
    };
  }

  return {
    kind: 'unknown',
    title: '请求失败',
    detail: error instanceof Error ? error.message : '发生未知错误，请检查配置后重试。'
  };
}
