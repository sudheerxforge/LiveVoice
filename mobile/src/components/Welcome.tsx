import React, { FC, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../theme';

export interface MoodChip {
  emoji: string;
  label: string;
  /** What the user "says" to open the conversation. */
  opener: string;
}

export const MOODS: MoodChip[] = [
  { emoji: '😊', label: 'Happy', opener: "I'm feeling happy today." },
  { emoji: '😔', label: 'Sad', opener: "I'm feeling sad today." },
  { emoji: '😰', label: 'Stressed', opener: "I'm feeling stressed and overwhelmed." },
  { emoji: '😴', label: 'Tired', opener: "I'm feeling really tired." },
  { emoji: '🥰', label: 'Grateful', opener: "I'm feeling grateful and loved." },
  { emoji: '💭', label: 'Need to vent', opener: 'I just need to talk and let things out for a while.' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night?';
}

const Chip: FC<{ mood: MoodChip; index: number; onPick: (m: MoodChip) => void; disabled: boolean }> = ({
  mood,
  index,
  onPick,
  disabled,
}) => {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      delay: 250 + index * 80,
      useNativeDriver: true,
    }).start();
  }, [enter, index]);
  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
        ],
      }}>
      <TouchableOpacity
        activeOpacity={0.75}
        disabled={disabled}
        onPress={() => onPick(mood)}
        style={[styles.chip, disabled && styles.chipDisabled]}>
        <Text style={styles.chipEmoji}>{mood.emoji}</Text>
        <Text style={styles.chipLabel}>{mood.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

/** Shown under the orb on an empty chat: a greeting and one-tap ways to begin. */
const Welcome: FC<{ onPick: (m: MoodChip) => void; disabled: boolean }> = ({
  onPick,
  disabled,
}) => (
  <View style={styles.wrap}>
    <Text style={styles.hello}>{greeting()}</Text>
    <Text style={styles.ask}>How are you feeling right now?</Text>
    <View style={styles.chips}>
      {MOODS.map((m, i) => (
        <Chip key={m.label} mood={m} index={i} onPick={onPick} disabled={disabled} />
      ))}
    </View>
    <Text style={styles.or}>or just tap Start Talking and say hello</Text>
    <Text style={styles.disclaimer}>
      LiveVoice is an AI companion, not a therapist or doctor.
    </Text>
  </View>
);

export default Welcome;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  hello: {
    color: theme.mute,
    fontSize: 16,
    marginTop: 34,
  },
  ask: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipEmoji: {
    fontSize: 18,
    marginRight: 7,
  },
  chipLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
  },
  or: {
    color: theme.dim,
    fontSize: 13,
    marginTop: 22,
  },
  disclaimer: {
    color: theme.dim,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
});
