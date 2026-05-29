import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { getMerchantCounts } from '@/utils/merchant';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function MerchantsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenses = useExpenseStore((s) => s.expenses);
  const renameMerchant = useExpenseStore((s) => s.renameMerchant);
  const merchants = useMemo(() => getMerchantCounts(expenses), [expenses]);

  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const openRename = (merchant: string) => {
    setEditing(merchant);
    setName(merchant);
  };

  const closeModal = () => {
    setEditing(null);
    setName('');
  };

  const handleSave = async () => {
    if (!editing) return;
    const next = name.trim();
    if (!next) { Alert.alert(t('common.error'), t('merchants.nameRequired')); return; }
    if (next === editing) { closeModal(); return; }
    setSaving(true);
    const count = await renameMerchant(editing, next);
    setSaving(false);
    closeModal();
    Alert.alert('', t('merchants.renamed', { count }));
  };

  const handleDelete = (merchant: string, count: number) => {
    Alert.alert(t('merchants.delete'), t('merchants.deleteConfirm', { count }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchants.delete'), style: 'destructive',
        onPress: async () => {
          const n = await renameMerchant(merchant, null);
          Alert.alert('', t('merchants.deleted', { count: n }));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Section header — same pattern as categories */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('settingsNav.merchants')}</Text>
        </View>

        <View style={styles.card}>
          {merchants.length === 0 ? (
            <Text style={styles.empty}>{t('merchants.empty')}</Text>
          ) : (
            merchants.map(({ merchant, count }, i) => (
              <React.Fragment key={merchant}>
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={canEdit ? () => openRename(merchant) : undefined}
                    activeOpacity={canEdit ? 0.7 : 1}
                  >
                    <View style={styles.iconWrap}>
                      <Ionicons name="storefront-outline" size={18} color={theme.colors.primary} />
                    </View>
                    <View style={styles.nameContainer}>
                      <Text style={styles.name} numberOfLines={1}>{merchant}</Text>
                      <Text style={styles.sub}>{t('merchants.expensesCount', { count })}</Text>
                    </View>
                  </TouchableOpacity>
                  {canEdit && (
                    <TouchableOpacity onPress={() => handleDelete(merchant, count)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
                {i < merchants.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('merchants.renameTitle')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('merchants.renamePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  rowContent: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const, alignItems: 'center' as const,
  },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3] },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  divider: {
    height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body, color: theme.colors.textTertiary,
    textAlign: 'center' as const, paddingVertical: theme.spacing[4],
  },
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const, marginBottom: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16, color: theme.colors.textPrimary, marginBottom: theme.spacing[4],
  },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
