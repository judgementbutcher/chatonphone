import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteConversation, getConversation, listConversations, resetLocalData, saveConversation } from '../../src/storage/conversationRepo';
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

  it('deletes conversations', async () => {
    await saveConversation(conversation);
    await deleteConversation('c1');

    await expect(getConversation('c1')).resolves.toBeUndefined();
  });
});
