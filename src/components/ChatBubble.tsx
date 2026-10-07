import React, { FC, memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChatMessage } from '../storage/chatHistory';
import { formatTime } from '../utils/time';

/** User messages on the right, Gemini's replies on the left. */
const ChatBubble: FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowModel]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.modelBubble]}>
        <Text style={styles.text}>{message.text.trim()}</Text>
      </View>
      <Text style={[styles.meta, isUser && styles.metaUser]}>
        {isUser ? 'You' : 'Gemini'} · {formatTime(message.createdAt)}
        {message.interrupted ? ' · interrupted' : ''}
      </Text>
    </View>
  );
};

export default memo(ChatBubble);

const styles = StyleSheet.create({
  row: {
    maxWidth: '82%',
    marginVertical: 4,
  },
  rowUser: {
    alignSelf: 'flex-end',
  },
  rowModel: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 4,
  },
  text: {
    color: '#F8FAFC',
    fontSize: 16,
    lineHeight: 22,
  },
  meta: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 3,
    marginHorizontal: 6,
  },
  metaUser: {
    textAlign: 'right',
  },
});
