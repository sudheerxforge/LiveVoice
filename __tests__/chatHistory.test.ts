import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChatMessage,
  chatTitle,
  deleteAllChats,
  deleteChat,
  loadChatList,
  loadChatMessages,
  saveChat,
} from '../src/storage/chatHistory';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const msg = (role: ChatMessage['role'], text: string, createdAt = 1000): ChatMessage => ({
  id: `${role}-${text}`,
  role,
  text,
  createdAt,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('migrates the old single history into the first chat', async () => {
  const old = [msg('user', 'Hello', 1000), msg('model', 'Hi! How can I help?', 2000)];
  await AsyncStorage.setItem('chatHistory.v1', JSON.stringify(old));

  const list = await loadChatList();

  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ title: 'Hello', messageCount: 2 });
  expect(await loadChatMessages(list[0].id)).toEqual(old);
  expect(await AsyncStorage.getItem('chatHistory.v1')).toBeNull();
  // A second launch reads the index instead of migrating again.
  expect(await loadChatList()).toEqual(list);
});

test('keeps chats separate, most recently used first', async () => {
  let list = await loadChatList();
  list = await saveChat('a', [msg('user', 'First chat')], list);
  list = await saveChat('b', [msg('user', 'Second chat')], list);
  expect(list.map(c => c.id)).toEqual(['b', 'a']);

  list = await saveChat('a', [msg('user', 'First chat'), msg('model', 'Reply')], list);
  expect(list.map(c => c.id)).toEqual(['a', 'b']);
  expect(list[0].messageCount).toBe(2);

  expect(await loadChatMessages('b')).toEqual([msg('user', 'Second chat')]);
  expect(await loadChatList()).toEqual(list);
});

test('deletes one chat or all chats', async () => {
  let list = await saveChat('a', [msg('user', 'A')], []);
  list = await saveChat('b', [msg('user', 'B')], list);

  list = await deleteChat('a', list);
  expect(list.map(c => c.id)).toEqual(['b']);
  expect(await loadChatMessages('a')).toEqual([]);

  await deleteAllChats(list);
  expect(await loadChatList()).toEqual([]);
  expect(await loadChatMessages('b')).toEqual([]);
});

test('titles chats from the first thing the user said', () => {
  expect(chatTitle([msg('model', 'Hi'), msg('user', '  Plan   a trip ')])).toBe('Plan a trip');
  expect(chatTitle([msg('user', 'x'.repeat(60))])).toBe(`${'x'.repeat(40)}…`);
  expect(chatTitle([])).toBe('New chat');
});
