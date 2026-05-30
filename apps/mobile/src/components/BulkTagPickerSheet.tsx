import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';

interface Props {
  tags: { id: string; name: string; isDeleted?: boolean }[];
  onConfirm: (tagIds: string[]) => void;
  onClose: () => void;
}

export function BulkTagPickerSheet({ tags, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [pickedTagIds, setPickedTagIds] = useState<string[]>([]);
  const activeTags = tags.filter((tag) => !tag.isDeleted);

  const toggle = (id: string) =>
    setPickedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          {t('expenses.bulkAddTag')}
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={[styles.cancel, { color: theme.colors.primary }]}>
            {t('common.cancel')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {activeTags.map((tag) => {
          const picked = pickedTagIds.includes(tag.id);
          return (
            <TouchableOpacity
              key={tag.id}
              style={[styles.row, { borderBottomColor: theme.colors.divider }]}
              onPress={() => toggle(tag.id)}
            >
              <Ionicons
                name="bookmark-outline"
                size={18}
                color={picked ? theme.colors.accent : theme.colors.textSecondary}
                style={styles.rowIcon}
              />
              <Text
                style={[
                  styles.rowText,
                  { color: picked ? theme.colors.accent : theme.colors.textPrimary },
                ]}
              >
                {tag.name}
              </Text>
              {picked && (
                <Ionicons name="checkmark" size={18} color={theme.colors.accent} />
              )}
            </TouchableOpacity>
          );
        })}
        {activeTags.length === 0 && (
          <Text style={[styles.empty, { color: theme.colors.textTertiary }]}>
            {t('tags.noTags') || 'No tags yet'}
          </Text>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.confirmButton,
          { backgroundColor: theme.colors.primary, opacity: pickedTagIds.length === 0 ? 0.4 : 1 },
        ]}
        disabled={pickedTagIds.length === 0}
        onPress={() => onConfirm(pickedTagIds)}
      >
        <Text style={[styles.confirmText, { color: theme.colors.textInverse }]}>
          {t('common.done')}
        </Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancel: {
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowIcon: {
    marginRight: 8,
  },
  rowText: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  confirmButton: {
    margin: 16,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
