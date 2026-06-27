import type { Conversation, ConversationMessageSearchResult, ConversationSummary } from '../domain/types';
import { clearSettings } from '../settings/settingsStore';
import { openChatDb, toConversationSummary } from './db';

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await openChatDb();
  const transaction = db.transaction(['conversations', 'conversationSummaries'], 'readwrite');
  try {
    await Promise.all([
      transaction.objectStore('conversations').put(conversation),
      transaction.objectStore('conversationSummaries').put(toConversationSummary(conversation)),
      transaction.done
    ]);
  } finally {
    db.close();
  }
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await openChatDb();
  try {
    return await db.get('conversations', id);
  } finally {
    db.close();
  }
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await openChatDb();
  try {
    const conversations = await db.getAllFromIndex('conversations', 'by-updated-at');
    return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
  } finally {
    db.close();
  }
}

export async function listConversationSummaries(): Promise<ConversationSummary[]> {
  const db = await openChatDb();
  try {
    const summaries = await db.getAllFromIndex('conversationSummaries', 'by-updated-at');
    return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
  } finally {
    db.close();
  }
}

export async function searchConversationMessages(
  query: string,
  limit = 12
): Promise<ConversationMessageSearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery || limit <= 0) {
    return [];
  }

  const db = await openChatDb();
  try {
    const conversations = await db.getAllFromIndex('conversations', 'by-updated-at');
    const results: ConversationMessageSearchResult[] = [];

    for (const conversation of conversations.sort((left, right) => right.updatedAt - left.updatedAt)) {
      for (const message of conversation.messages) {
        if (!message.text.toLowerCase().includes(normalizedQuery)) {
          continue;
        }

        results.push({
          conversationId: conversation.id,
          conversationTitle: conversation.title,
          messageId: message.id,
          text: message.text,
          updatedAt: conversation.updatedAt
        });

        if (results.length >= limit) {
          return results;
        }
      }
    }

    return results;
  } finally {
    db.close();
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openChatDb();
  const transaction = db.transaction(['conversations', 'conversationSummaries'], 'readwrite');
  try {
    await Promise.all([
      transaction.objectStore('conversations').delete(id),
      transaction.objectStore('conversationSummaries').delete(id),
      transaction.done
    ]);
  } finally {
    db.close();
  }
}

export async function resetLocalData(): Promise<void> {
  const db = await openChatDb();
  const transaction = db.transaction(['conversations', 'conversationSummaries'], 'readwrite');
  try {
    await Promise.all([
      transaction.objectStore('conversations').clear(),
      transaction.objectStore('conversationSummaries').clear(),
      transaction.done
    ]);
    clearSettings();
  } finally {
    db.close();
  }
}
