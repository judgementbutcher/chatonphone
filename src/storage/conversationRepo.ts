import type { Conversation } from '../domain/types';
import { clearSettings } from '../settings/settingsStore';
import { openChatDb } from './db';

export async function saveConversation(conversation: Conversation): Promise<void> {
  const db = await openChatDb();
  await db.put('conversations', conversation);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await openChatDb();
  return db.get('conversations', id);
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await openChatDb();
  const conversations = await db.getAllFromIndex('conversations', 'by-updated-at');
  return conversations.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await openChatDb();
  await db.delete('conversations', id);
}

export async function resetLocalData(): Promise<void> {
  const db = await openChatDb();
  await db.clear('conversations');
  clearSettings();
}
