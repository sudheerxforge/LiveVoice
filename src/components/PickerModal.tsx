import React, { FC, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export interface PickerItem {
  key: string;
  title: string;
  subtitle?: string;
  /** Extra text matched by the search box but not shown. */
  keywords?: string;
}

interface Props {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedKey: string;
  searchable?: boolean;
  onSelect: (key: string) => void;
  onClose: () => void;
}

const PickerModal: FC<Props> = ({
  visible,
  title,
  items,
  selectedKey,
  searchable = false,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter(item =>
      `${item.title} ${item.subtitle ?? ''} ${item.keywords ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={close} hitSlop={12}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        {searchable && (
          <TextInput
            style={styles.search}
            placeholder="Search"
            placeholderTextColor="#64748B"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        )}

        <FlatList
          data={filtered}
          keyExtractor={item => item.key}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListEmptyComponent={
            <Text style={styles.empty}>No matches for “{query}”</Text>
          }
          renderItem={({ item }) => {
            const selected = item.key === selectedKey;
            return (
              <TouchableOpacity
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => {
                  onSelect(item.key);
                  close();
                }}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  {!!item.subtitle && (
                    <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                  )}
                </View>
                {selected && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
};

export default PickerModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    maxHeight: '80%',
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '600',
  },
  closeText: {
    color: '#60A5FA',
    fontSize: 16,
  },
  search: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  rowSelected: {
    backgroundColor: '#1E3A8A',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: '#F8FAFC',
    fontSize: 16,
  },
  rowSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  check: {
    color: '#60A5FA',
    fontSize: 18,
    marginLeft: 8,
  },
  empty: {
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
