import { View, Text, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ShoppingListTemplate } from '@budget/shared-types';

interface TemplatesModalProps {
  visible: boolean;
  onClose: () => void;
  templates: ShoppingListTemplate[];
  isLoading: boolean;
  canEdit: boolean;
  canSaveCurrent: boolean;
  onApplyTemplate: (template: ShoppingListTemplate) => void;
  onRenameTemplate: (template: ShoppingListTemplate) => void;
  onDeleteTemplate: (template: ShoppingListTemplate) => void;
  onSaveCurrentAsTemplate: () => void;
  bottomInset: number;
}

export function TemplatesModal({
  visible,
  onClose,
  templates,
  isLoading,
  canEdit,
  canSaveCurrent,
  onApplyTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onSaveCurrentAsTemplate,
  bottomInset,
}: TemplatesModalProps) {
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
          <Text style={styles.modalTitle}>{t('shoppingList.templates')}</Text>

          <TouchableOpacity
            style={[styles.saveCurrentRow, !canSaveCurrent && styles.saveCurrentRowDisabled]}
            onPress={onSaveCurrentAsTemplate}
            disabled={!canSaveCurrent}
          >
            <Ionicons name="bookmark-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.saveCurrentText}>{t('shoppingList.saveAsTemplate')}</Text>
          </TouchableOpacity>

          {isLoading && templates.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : templates.length === 0 ? (
            <Text style={styles.emptyText}>{t('shoppingList.noTemplates')}</Text>
          ) : (
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {templates.map((template) => (
                <View key={template.id} style={styles.templateRow}>
                  <TouchableOpacity
                    style={styles.templateRowMain}
                    onPress={() => onApplyTemplate(template)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.templateRowName} numberOfLines={1}>
                      {template.name}
                    </Text>
                    <Text style={styles.templateRowCount}>
                      {t('shoppingList.templateItemCount', { count: template.items.length })}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.templateRowActions}>
                    <TouchableOpacity
                      onPress={() => onRenameTemplate(template)}
                      hitSlop={8}
                      style={styles.templateActionBtn}
                    >
                      <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => onDeleteTemplate(template)}
                        hitSlop={8}
                        style={styles.templateActionBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

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

  saveCurrentRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    marginBottom: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  saveCurrentRowDisabled: { opacity: 0.4 },
  saveCurrentText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },

  loadingRow: { paddingVertical: theme.spacing[6], alignItems: 'center' as const },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[6],
  },

  modalScroll: { flexGrow: 0 },
  templateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  templateRowMain: { flex: 1 },
  templateRowName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  templateRowCount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  templateRowActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flexShrink: 0,
  },
  templateActionBtn: { flexShrink: 0 },

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
