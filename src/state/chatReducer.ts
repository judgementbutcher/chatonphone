import type { ChatMessage } from '../domain/types';

export interface ChatState {
  messages: ChatMessage[];
  isGenerating: boolean;
  activeAssistantMessageId: string | null;
  error: string | null;
}

export const initialChatState: ChatState = {
  messages: [],
  isGenerating: false,
  activeAssistantMessageId: null,
  error: null
};

export type ChatAction =
  | {
      type: 'send-user-message';
      message: ChatMessage;
      assistantMessageId: string;
      now: number;
    }
  | {
      type: 'append-assistant-delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'replace-assistant-text';
      messageId: string;
      text: string;
    }
  | {
      type: 'begin-assistant-message';
      messageId: string;
      now: number;
    }
  | {
      // Regenerate an existing assistant message in place: snapshot its current
      // answer into `versions`, append a fresh empty slot, and stream into it so
      // prior attempts remain switchable.
      type: 'begin-regeneration';
      messageId: string;
    }
  | {
      type: 'switch-version';
      messageId: string;
      versionIndex: number;
    }
  | {
      type: 'truncate-after-message';
      messageId: string;
    }
  | {
      type: 'remove-message';
      messageId: string;
    }
  | {
      type: 'delete-message';
      messageId: string;
    }
  | {
      type: 'update-message-content';
      messageId: string;
      text: string;
    }
  | {
      type: 'finish-generation';
    }
  | {
      type: 'set-error';
      message: string;
    }
  | {
      type: 'load-messages';
      messages: ChatMessage[];
    };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  // When an assistant message carries multiple answer versions, its live `text`
  // is the active version. This mirrors an updated `text` back into that slot so
  // streaming/replacement keeps the version array authoritative. It's a no-op
  // for messages without versions, so single-answer behaviour is unchanged.
  function withSyncedActiveVersion(message: ChatMessage, text: string): ChatMessage {
    if (!message.versions || message.activeVersionIndex === undefined) {
      return { ...message, text };
    }

    const versions = message.versions.map((version, index) =>
      index === message.activeVersionIndex ? text : version
    );

    return { ...message, text, versions };
  }

  switch (action.type) {
    case 'send-user-message': {
      const assistant: ChatMessage = {
        id: action.assistantMessageId,
        role: 'assistant',
        text: '',
        attachments: [],
        createdAt: action.now
      };

      return {
        ...state,
        messages: [...state.messages, action.message, assistant],
        isGenerating: true,
        activeAssistantMessageId: action.assistantMessageId,
        error: null
      };
    }

    case 'append-assistant-delta':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId ? withSyncedActiveVersion(message, message.text + action.delta) : message
        )
      };

    case 'replace-assistant-text':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId ? withSyncedActiveVersion(message, action.text) : message
        )
      };

    case 'begin-assistant-message':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.messageId,
            role: 'assistant',
            text: '',
            attachments: [],
            createdAt: action.now
          }
        ],
        isGenerating: true,
        activeAssistantMessageId: action.messageId,
        error: null
      };

    case 'begin-regeneration':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.messageId) {
            return message;
          }

          // Seed the version array from the current single answer on first
          // regeneration, then append a fresh empty slot and point at it.
          const existingVersions = message.versions ?? [message.text];
          const nextVersions = [...existingVersions, ''];

          return {
            ...message,
            text: '',
            versions: nextVersions,
            activeVersionIndex: nextVersions.length - 1
          };
        }),
        isGenerating: true,
        activeAssistantMessageId: action.messageId,
        error: null
      };

    case 'switch-version':
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.messageId || !message.versions) {
            return message;
          }

          const versionIndex = Math.max(0, Math.min(action.versionIndex, message.versions.length - 1));

          return {
            ...message,
            text: message.versions[versionIndex],
            activeVersionIndex: versionIndex
          };
        })
      };

    case 'truncate-after-message': {
      const index = state.messages.findIndex((message) => message.id === action.messageId);

      if (index === -1) {
        return state;
      }

      return {
        ...state,
        messages: state.messages.slice(0, index + 1),
        error: null
      };
    }

    case 'remove-message':
      return {
        ...state,
        messages: state.messages.filter((message) => message.id !== action.messageId),
        error: null
      };

    case 'delete-message':
      return {
        ...state,
        messages: state.messages.filter((message) => message.id !== action.messageId),
        error: null
      };

    case 'update-message-content':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId
            ? { ...message, text: action.text, attachments: [] }
            : message
        ),
        error: null
      };

    case 'finish-generation':
      return {
        ...state,
        isGenerating: false,
        activeAssistantMessageId: null
      };

    case 'set-error':
      return {
        ...state,
        isGenerating: false,
        activeAssistantMessageId: null,
        error: action.message
      };

    case 'load-messages':
      return {
        ...state,
        messages: action.messages,
        isGenerating: false,
        activeAssistantMessageId: null,
        error: null
      };
  }
}
