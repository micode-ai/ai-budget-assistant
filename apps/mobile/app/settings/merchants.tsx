import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { getMerchantCounts } from '@/utils/merchant';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function MerchantsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
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

  const handleSaveRename = async () => {
    if (!editing) return;
    const next = name.trim();
    if (!next) {
      Alert.alert(t('common.error'), t('merchants.nameRequired'));
      return;
    }
    if (next === editing) {
      setEditing(null);
      return;
    }
    setSaving(true);
    const count = await renameMerchant(editing, next);
    setSaving(false);
    setEditing(null);
    Alert.alert('', t('merchants.renamed', { count }));
  };

  const handleDelete = (merchant: string, count: number) => {
    Alert.alert(
      t('merchants.delete'),
      t('merchants.deleteConfirm', { count }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('merchants.delete'),
          style: 'destructive',
          onPress: async () => {
            const n = await renameMerchant(merchant, null);
            Alert.alert('', t('merchants.deleted', { count: n }));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {merchants.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="storefront-outline" size={56} color={theme.colors.textDisabled} />
            <Text style={styles.emptyText}>{t('merchants.empty')}</Text>
          </View>
        ) : (
          merchants.map(({ merchant, count }) => (
            <View key={merchant} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{merchant}</Text>
                <Text style={styles.rowCount}>{t('merchants.expensesCount', { count })}</Text>
              </View>
              <TouchableOpacity onPress={() => openRename(merchant)} style={styles.rowBtn}>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(merchant, count)} style={styles.rowBtn}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalCard}>
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
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditing(null)}>
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveRename} disabled={saving}>
                <Text style={styles.modalSaveText}>{t('common.save')}</Text>
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
  content: { padding: theme.spacing[4] },
  empty: { alignItems: 'center' as const, paddingVertical: theme.spacing[10], gap: theme.spacing[3] },
  emptyText: { fontSize: 15, color: theme.colors.textTertiary },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textPrimary },
  rowCount: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
  rowBtn: { padding: theme.spacing[2] },
  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' as const },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  modalTitle: { fontSize: 18, fontWeight: '600' as const, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5], paddingVertical: theme.spacing[2.5], fontSize: 16,
    color: theme.colors.textPrimary, marginBottom: theme.spacing[4],
  },
  modalActions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  modalCancel: {
    flex: 1, alignItems: 'center' as const, paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg, borderWidth: 2, borderColor: theme.colors.textDisabled,
  },
  modalCancelText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textSecondary },
  modalSave: {
    flex: 1, alignItems: 'center' as const, paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg, backgroundColor: theme.colors.primary,
  },
  modalSaveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
