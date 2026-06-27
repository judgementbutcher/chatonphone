import { openDB, type DBSchema } from 'idb';
import type { Conversation, ConversationSummary } from '../domain/types';

interface ChatOnPhoneDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updated-at': number;
    };
  };
  conversationSummaries: {
    key: string;
    value: ConversationSummary;
    indexes: {
      'by-updated-at': number;
    };
  };
}

const DB_NAME = 'chatonphone';
const DB_VERSION = 2;

function compactPreviewText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function toConversationSummary(conversation: Conversation): ConversationSummary {
  const previewMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.text.trim() || message.attachments.length > 0);

  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    previewText: previewMessage
      ? compactPreviewText(previewMessage.text) || (previewMessage.attachments.length > 0 ? '附件' : '')
      : '',
    personaId: conversation.personaId
  };
}

export function openChatDb() {
  return openDB<ChatOnPhoneDB>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' });
        store.createIndex('by-updated-at', 'updatedAt');
      }

      if (!db.objectStoreNames.contains('conversationSummaries')) {
        const summaryStore = db.createObjectStore('conversationSummaries', { keyPath: 'id' });
        summaryStore.createIndex('by-updated-at', 'updatedAt');
      }

      if (oldVersion < 2) {
        const conversationStore = transaction.objectStore('conversations');
        const summaryStore = transaction.objectStore('conversationSummaries');

        let cursor = await conversationStore.openCursor();
        while (cursor) {
          await summaryStore.put(toConversationSummary(cursor.value));
          cursor = await cursor.continue();
        }
      }
    }
  });
}

export { toConversationSummary };
