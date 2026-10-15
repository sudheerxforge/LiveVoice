import React, { FC, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PANEL_WIDTH = Math.min(340, Dimensions.get('window').width * 0.85);

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A drawer that slides in from the left over a dimmed backdrop. */
const SideMenu: FC<Props> = ({ visible, onClose, children }) => {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  // Keep the Modal mounted until the close animation has finished.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible, progress]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-PANEL_WIDTH, 0],
                }),
              },
            ],
          },
        ]}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </Animated.View>
    </Modal>
  );
};

export default SideMenu;

// --- Building blocks for the menu contents ---

export const MenuSection: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

export const MenuRow: FC<{
  label: string;
  value?: string;
  disabled?: boolean;
  danger?: boolean;
  onPress: () => void;
}> = ({ label, value, disabled, danger, onPress }) => (
  <TouchableOpacity
    style={[styles.row, disabled && styles.rowDisabled]}
    disabled={disabled}
    onPress={onPress}>
    <View style={styles.rowText}>
      <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
    {!danger && <Text style={styles.chevron}>›</Text>}
  </TouchableOpacity>
);

export const ChatListRow: FC<{
  title: string;
  subtitle: string;
  active: boolean;
  onPress: () => void;
  onDelete: () => void;
}> = ({ title, subtitle, active, onPress, onDelete }) => (
  <TouchableOpacity
    style={[styles.chatRow, active && styles.chatRowActive]}
    onPress={onPress}
    onLongPress={onDelete}>
    <View style={styles.rowText}>
      <Text style={styles.chatTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.chatSubtitle}>{subtitle}</Text>
    </View>
    <TouchableOpacity
      onPress={onDelete}
      hitSlop={10}
      accessibilityLabel={`Delete chat ${title}`}>
      <Text style={styles.chatDelete}>🗑</Text>
    </TouchableOpacity>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  chatRowActive: {
    backgroundColor: '#1E3A8A',
  },
  chatTitle: {
    color: '#F8FAFC',
    fontSize: 15,
  },
  chatSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  chatDelete: {
    fontSize: 16,
    marginLeft: 10,
    opacity: 0.7,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: '#0F172A',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
  },
  close: {
    color: '#94A3B8',
    fontSize: 20,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  rowValue: {
    color: '#F8FAFC',
    fontSize: 16,
    marginTop: 2,
  },
  danger: {
    color: '#F87171',
    fontSize: 15,
  },
  chevron: {
    color: '#64748B',
    fontSize: 24,
    marginLeft: 8,
  },
});
