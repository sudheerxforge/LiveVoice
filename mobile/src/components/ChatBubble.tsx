import React, { FC, memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { ChatMessage } from '../storage/chatHistory';
import { formatTime } from '../utils/time';

/** User messages on the right, Gemini's replies on the left. */
const ChatBubble: FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  // Slide and fade in when the bubble first appears.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [enter]);
  return (
    <Animated.View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowModel,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        },
      ]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.modelBubble]}>
        <Text style={styles.text}>{message.text.trim()}</Text>
      </View>
      <Text style={[styles.meta, isUser && styles.metaUser]}>
        {isUser ? 'You' : 'LiveVoice'} · {formatTime(message.createdAt)}
        {message.interrupted ? ' · interrupted' : ''}
      </Text>
    </Animated.View>
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
    backgroundColor: theme.violet,
    borderBottomRightRadius: 4,
  },
  modelBubble: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.line,
    borderBottomLeftRadius: 4,
  },
  text: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 22,
  },
  meta: {
    color: theme.dim,
    fontSize: 11,
    marginTop: 3,
    marginHorizontal: 6,
  },
  metaUser: {
    textAlign: 'right',
  },
});
