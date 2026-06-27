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

// A reusable system-prompt preset. Stored in the global library (AppSettings)
// and bound to individual conversations by id; the resolved prompt text is also
// snapshotted onto the conversation so a deleted/edited preset never breaks an
// existing conversation's behaviour.
export interface Persona {
  id: string;
  name: string;
  prompt: string;
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
  personas?: Persona[]; // 全局角色预设库
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
  // Lightweight answer branching: each regeneration of an assistant message
  // pushes its prior answer here and streams a fresh one, so the user can flip
  // between attempts. `text` always mirrors `versions[activeVersionIndex]`.
  // Absent (or length <= 1) means the message has only ever had one answer.
  versions?: string[];
  activeVersionIndex?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
  // Bound persona: the resolved prompt text is snapshotted so editing/deleting
  // the global preset never silently changes an existing conversation.
  personaId?: string;
  systemPrompt?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  previewText: string;
  personaId?: string;
}

export interface ConversationMessageSearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  text: string;
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
        detail?: 'auto' | 'low' | 'high';
      };
    };
