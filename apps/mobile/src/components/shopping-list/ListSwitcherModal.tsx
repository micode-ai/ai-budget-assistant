import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ShoppingList } from '@budget/shared-types';

interface ListSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
  lists: ShoppingList[];
  activeListId: string | null;
  canEdit: boolean;
  onSelectList: (id: string) => void;
  onRenameList: (list: ShoppingList) => void;
  onArchiveList: (list: ShoppingList) => void;
  onDeleteList: (list: ShoppingList) => void;
  onCreateList: () => void;
  bottomInset: number;
}

export function ListSwitcherModal({
  visible,
  onClose,
  lists,
  activeListId,
  canEdit,
  onSelectList,
  onRenameList,
  onArchiveList,
  onDeleteList,
  onCreateList,
  bottomInset,
}: ListSwitcherModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(bottomInset, 24) + 16, maxHeight: '82%' },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{t('shoppingList.manageLists')}</Text>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {lists.map((list) => {
              const isActive = list.id === activeListId;
              return (
                <View key={list.id} style={styles.listRow}>
                  <TouchableOpacity
                    style={styles.listRowMain}
                    onPress={() => onSelectList(list.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.listRowName, isActive && styles.listRowNameActive]}
                      numberOfLines={1}
                    >
                      {list.name}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                  <View style={styles.listRowActions}>
                    <TouchableOpacity
                      onPress={() => onRenameList(list)}
                      hitSlop={8}
                      style={styles.listActionBtn}
                    >
                      <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => onArchiveList(list)}
                        hitSlop={8}
                        style={styles.listActionBtn}
                      >
                        <Ionicons name="archive-outline" size={18} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => onDeleteList(list)}
                        hitSlop={8}
                        style={styles.listActionBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.newListRow} onPress={onCreateList}>
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.newListText}>{t('shoppingList.newList')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  modalScroll: { flexGrow: 0 },

  listRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  listRowMain: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  listRowName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flexShrink: 1 },
  listRowNameActive: { color: theme.colors.primary, fontWeight: '600' as const },
  listRowActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flexShrink: 0,
  },
  listActionBtn: { flexShrink: 0 },

  newListRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  newListText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },

  doneButton: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    marginTop: theme.spacing[3],
  },
  doneButtonText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary },
});
