import { openDB, type DBSchema } from 'idb';
import type { Conversation } from '../domain/types';

interface ChatOnPhoneDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updated-at': number;
    };
  };
}

const DB_NAME = 'chatonphone';
const DB_VERSION = 1;

export function openChatDb() {
  return openDB<ChatOnPhoneDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('conversations', { keyPath: 'id' });
      store.createIndex('by-updated-at', 'updatedAt');
    }
  });
}
