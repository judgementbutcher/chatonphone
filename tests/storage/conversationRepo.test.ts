import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteConversation,
  getConversation,
  listConversationSummaries,
  listConversations,
  resetLocalData,
  saveConversation,
  searchConversationMessages
} from '../../src/storage/conversationRepo';
import type { Conversation } from '../../src/domain/types';

const conversation: Conversation = {
  id: 'c1',
  title: '图片分析',
  model: 'vision-model',
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: 'm1',
      role: 'user',
      text: '看图',
      attachments: [],
      createdAt: 1
    }
  ]
};

function deleteDatabase(name: string) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    request.onblocked = () => reject(new Error(`Deleting ${name} was blocked.`));
  });
}

function seedVersionOneDatabase(conversations: Conversation[]) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('chatonphone', 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore('conversations', { keyPath: 'id' });
      store.createIndex('by-updated-at', 'updatedAt');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('conversations', 'readwrite');
      const store = transaction.objectStore('conversations');

      conversations.forEach((storedConversation) => store.put(storedConversation));
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

describe('conversationRepo', () => {
  beforeEach(async () => {
    await resetLocalData();
  });

  it('saves and loads a conversation', async () => {
    await saveConversation(conversation);

    await expect(getConversation('c1')).resolves.toEqual(conversation);
  });

  it('lists conversations newest first', async () => {
    await saveConversation({ ...conversation, id: 'older', updatedAt: 1 });
    await saveConversation({ ...conversation, id: 'newer', updatedAt: 10 });

    await expect(listConversations()).resolves.toMatchObject([
      { id: 'newer' },
      { id: 'older' }
    ]);
  });

  it('saves and lists conversation summaries newest first', async () => {
    await saveConversation({ ...conversation, id: 'older', updatedAt: 1 });
    await saveConversation({
      ...conversation,
      id: 'newer',
      updatedAt: 10,
      messages: [
        ...conversation.messages,
        {
          id: 'm2',
          role: 'assistant',
          text: '摘要预览内容',
          attachments: [],
          createdAt: 2
        }
      ]
    });

    await expect(listConversationSummaries()).resolves.toMatchObject([
      { id: 'newer', messageCount: 2, previewText: '摘要预览内容' },
      { id: 'older', messageCount: 1, previewText: '看图' }
    ]);
  });

  it('deletes conversations', async () => {
    await saveConversation(conversation);
    await deleteConversation('c1');

    await expect(getConversation('c1')).resolves.toBeUndefined();
    await expect(listConversationSummaries()).resolves.toEqual([]);
  });

  it('searches message text with a result limit', async () => {
    await saveConversation({
      ...conversation,
      id: 'c1',
      updatedAt: 3,
      messages: [
        { id: 'm1', role: 'user', text: 'alpha first', attachments: [], createdAt: 1 },
        { id: 'm2', role: 'assistant', text: 'alpha second', attachments: [], createdAt: 2 }
      ]
    });
    await saveConversation({
      ...conversation,
      id: 'c2',
      title: '更新的会话',
      updatedAt: 10,
      messages: [{ id: 'm3', role: 'user', text: 'alpha newest', attachments: [], createdAt: 3 }]
    });

    await expect(searchConversationMessages('alpha', 2)).resolves.toMatchObject([
      { conversationId: 'c2', conversationTitle: '更新的会话', messageId: 'm3' },
      { conversationId: 'c1', messageId: 'm1' }
    ]);
  });

  it('migrates v1 conversations into summaries', async () => {
    await deleteDatabase('chatonphone');
    await seedVersionOneDatabase([conversation]);

    await expect(listConversationSummaries()).resolves.toMatchObject([
      { id: 'c1', title: '图片分析', messageCount: 1, previewText: '看图' }
    ]);
  });
});
