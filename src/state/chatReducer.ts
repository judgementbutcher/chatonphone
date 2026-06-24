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
      type: 'truncate-after-message';
      messageId: string;
    }
  | {
      type: 'remove-message';
      messageId: string;
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
          message.id === action.messageId ? { ...message, text: message.text + action.delta } : message
        )
      };

    case 'replace-assistant-text':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId ? { ...message, text: action.text } : message
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
