export type RequestMode = 'auto' | 'direct' | 'proxy';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ProviderSettings {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string;
  requestMode: RequestMode;
  proxyUrl: string;
  proxyAccessToken: string;
  models: string[];
}

export interface SyncAccountSettings {
  endpoint: string;
  accountId: string;
  accessToken: string;
  autoSync: boolean;
}

export interface AppSettings {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  chatModel?: string; // 对话界面选择的模型（独立于设置界面）
  temperature: number;
  maxTokens: number;
  stream: boolean;
  requestMode: RequestMode;
  proxyUrl: string;
  proxyAccessToken: string;
  providers?: ProviderSettings[];
  selectedProviderId?: string;
  selectedModel?: string; // 设置界面选择的模型（仅用于测试）
  syncAccount?: SyncAccountSettings;
  darkMode?: boolean;
}

export interface ImageAttachment {
  kind?: 'image';
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface TextAttachment {
  kind: 'text';
  id: string;
  name: string;
  mimeType: string;
  text: string;
  sizeBytes: number;
}

export type FileAttachment = ImageAttachment | TextAttachment;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  attachments: FileAttachment[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
}

export type OpenAIMessage =
  | {
      role: ChatRole;
      content: string;
    }
  | {
      role: 'user';
      content: OpenAIContentPart[];
    };

export type OpenAIContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };
