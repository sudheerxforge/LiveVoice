import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: number; // epoch ms
  /** The user talked over the model before it finished this reply. */
  interrupted?: boolean;
}

/** Summary of a chat, shown in the chat list. Messages are stored separately. */
export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

// Storage layout: one small index of all chats, plus one key per chat's
// messages, so saving while talking only rewrites the current chat.
const INDEX_KEY = 'chats.index.v1';
const chatKey = (id: string) => `chats.messages.v1.${id}`;
// Before multiple chats existed, all messages were stored under this key.
const LEGACY_KEY = 'chatHistory.v1';

// Keep storage bounded; older messages are dropped first.
const MAX_MESSAGES_PER_CHAT = 500;
const TITLE_LENGTH = 40;

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** First thing the user said, shortened, e.g. "Plan a trip to Hyderab…". */
export function chatTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user' && m.text.trim());
  const text = (first ?? messages[0])?.text.trim().replace(/\s+/g, ' ') ?? '';
  if (!text) {
    return 'New chat';
  }
  return text.length > TITLE_LENGTH ? `${text.slice(0, TITLE_LENGTH)}…` : text;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.warn(`Could not read ${key}:`, e);
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not write ${key}:`, e);
  }
}

/** All chats, most recently used first. */
export async function loadChatList(): Promise<ChatSummary[]> {
  const index = await readJson<ChatSummary[] | null>(INDEX_KEY, null);
  if (index) {
    return index.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // First launch with multi-chat support: turn the old single history into
  // the first chat.
  const legacy = await readJson<ChatMessage[]>(LEGACY_KEY, []);
  const migrated: ChatSummary[] = [];
  if (legacy.length) {
    const id = newId();
    await writeJson(chatKey(id), legacy);
    migrated.push({
      id,
      title: chatTitle(legacy),
      createdAt: legacy[0].createdAt,
      updatedAt: legacy[legacy.length - 1].createdAt,
      messageCount: legacy.length,
    });
  }
  await writeJson(INDEX_KEY, migrated);
  await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
  return migrated;
}

export async function loadChatMessages(id: string): Promise<ChatMessage[]> {
  return readJson<ChatMessage[]>(chatKey(id), []);
}

/** Saves a chat's messages and returns the updated chat list. */
export async function saveChat(
  id: string,
  messages: ChatMessage[],
  list: ChatSummary[],
): Promise<ChatSummary[]> {
  const kept = messages.slice(-MAX_MESSAGES_PER_CHAT);
  await writeJson(chatKey(id), kept);

  const existing = list.find(c => c.id === id);
  const summary: ChatSummary = {
    id,
    title: chatTitle(kept),
    createdAt: existing?.createdAt ?? kept[0]?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    messageCount: kept.length,
  };
  const updated = [summary, ...list.filter(c => c.id !== id)];
  await writeJson(INDEX_KEY, updated);
  return updated;
}

/** Deletes one chat and returns the updated chat list. */
export async function deleteChat(
  id: string,
  list: ChatSummary[],
): Promise<ChatSummary[]> {
  const updated = list.filter(c => c.id !== id);
  await AsyncStorage.removeItem(chatKey(id)).catch(() => {});
  await writeJson(INDEX_KEY, updated);
  return updated;
}

export async function deleteAllChats(list: ChatSummary[]): Promise<void> {
  await Promise.all(
    list.map(c => AsyncStorage.removeItem(chatKey(c.id)).catch(() => {})),
  );
  await writeJson(INDEX_KEY, []);
}
