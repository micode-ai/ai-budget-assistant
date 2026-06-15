import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { useMerchantSuggestionStore } from '@/stores/merchantSuggestionStore';
import { getMerchantCounts, suggestMerchantGroups } from '@/utils/merchant';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function MerchantsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());
  const expenses = useExpenseStore((s) => s.expenses);
  const renameMerchant = useExpenseStore((s) => s.renameMerchant);
  const mergeMerchants = useExpenseStore((s) => s.mergeMerchants);
  const merchants = useMemo(() => getMerchantCounts(expenses), [expenses]);
  const countByMerchant = useMemo(
    () => new Map(merchants.map((m) => [m.merchant, m.count])),
    [merchants],
  );

  // Single rename modal
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Multi-select + merge
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');

  // Suggestions — dismissals persist across sessions (MMKV), keyed by fingerprint.
  const dismissed = useMerchantSuggestionStore((s) => s.dismissed);
  const dismissSuggestion = useMerchantSuggestionStore((s) => s.dismiss);
  // Cap visible banners so suggestions don't bury the merchant list; the next
  // batch surfaces on recompute after the top ones are merged/dismissed.
  const suggestions = useMemo(
    () =>
      suggestMerchantGroups(merchants)
        .filter((g) => !dismissed.has(g.fingerprint))
        .slice(0, 3),
    [merchants, dismissed],
  );

  const openRename = (merchant: string) => {
    setEditing(merchant);
    setName(merchant);
  };
  const closeRename = () => {
    setEditing(null);
    setName('');
  };

  const handleSaveRename = async () => {
    if (!editing) return;
    const next = name.trim();
    if (!next) { showAlert(t('common.error'), t('merchants.nameRequired')); return; }
    if (next === editing) { closeRename(); return; }
    setSaving(true);
    const count = await renameMerchant(editing, next);
    setSaving(false);
    closeRename();
    showAlert('', t('merchants.renamed', { count }));
  };

  const handleDelete = (merchant: string, count: number) => {
    showAlert(t('merchants.delete'), t('merchants.deleteConfirm', { count }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchants.delete'), style: 'destructive',
        onPress: async () => {
          const n = await renameMerchant(merchant, null);
          showAlert('', t('merchants.deleted', { count: n }));
        },
      },
    ]);
  };

  const toggleSelect = (merchant: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(merchant)) next.delete(merchant); else next.add(merchant);
      return next;
    });
  };
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Default canonical = highest-count name among the given sources
  const defaultCanonical = (sources: string[]) =>
    [...sources].sort((a, b) => (countByMerchant.get(b) ?? 0) - (countByMerchant.get(a) ?? 0))[0] ?? '';

  const openMergeFromSelection = () => {
    const sources = [...selected];
    if (sources.length < 2) { showAlert('', t('merchants.selectToMerge')); return; }
    setMergeSources(sources);
    setMergeName(defaultCanonical(sources));
  };
  const openMergeFromSuggestion = (members: string[], canonical: string) => {
    setMergeSources(members);
    setMergeName(canonical);
  };
  const closeMerge = () => {
    setMergeSources(null);
    setMergeName('');
  };

  const mergeExpenseCount = useMemo(
    () => (mergeSources ?? []).reduce((s, m) => s + (countByMerchant.get(m) ?? 0), 0),
    [mergeSources, countByMerchant],
  );

  const handleConfirmMerge = async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) { showAlert(t('common.error'), t('merchants.nameRequired')); return; }
    setSaving(true);
    const count = await mergeMerchants(mergeSources, target);
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('merchants.merged', { name: target, count }));
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Section header — switches to selection controls in select mode */}
        <View style={styles.sectionHeader}>
          {selecting ? (
            <>
              <Text style={styles.sectionTitle}>{t('merchants.selected', { count: selected.size })}</Text>
              <TouchableOpacity onPress={exitSelect}>
                <Text style={styles.headerAction}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>{t('settingsNav.merchants')}</Text>
              {canEdit && merchants.length > 1 && (
                <TouchableOpacity onPress={() => setSelecting(true)}>
                  <Text style={styles.headerAction}>{t('merchants.select')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Suggestion banners (hidden during selection mode) */}
        {canEdit && !selecting && suggestions.map((g) => (
          <View key={g.fingerprint} style={styles.suggestion}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.suggestionTitle}>{t('merchants.suggestionTitle')}</Text>
            </View>
            <Text style={styles.suggestionBody} numberOfLines={2}>
              {g.members.join(', ')}
            </Text>
            <View style={styles.suggestionActions}>
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => dismissSuggestion(g.fingerprint)}
              >
                <Text style={styles.dismissText}>{t('merchants.dismiss')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.suggestionMergeButton}
                onPress={() => openMergeFromSuggestion(g.members, g.canonical)}
              >
                <Text style={styles.suggestionMergeText} numberOfLines={1} ellipsizeMode="tail">
                  {t('merchants.suggestionMerge', { name: g.canonical })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.card}>
          {merchants.length === 0 ? (
            <Text style={styles.empty}>{t('merchants.empty')}</Text>
          ) : (
            merchants.map(({ merchant, count }, i) => {
              const isSelected = selected.has(merchant);
              return (
                <React.Fragment key={merchant}>
                  <View style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowContent}
                      onPress={
                        !canEdit
                          ? undefined
                          : selecting
                            ? () => toggleSelect(merchant)
                            : () => openRename(merchant)
                      }
                      activeOpacity={canEdit ? 0.7 : 1}
                    >
                      {selecting ? (
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={isSelected ? theme.colors.primary : theme.colors.textTertiary}
                        />
                      ) : (
                        <View style={styles.iconWrap}>
                          <Ionicons name="storefront-outline" size={18} color={theme.colors.primary} />
                        </View>
                      )}
                      <View style={styles.nameContainer}>
                        <Text style={styles.name} numberOfLines={1}>{merchant}</Text>
                        <Text style={styles.sub}>{t('merchants.expensesCount', { count })}</Text>
                      </View>
                    </TouchableOpacity>
                    {canEdit && !selecting && (
                      <TouchableOpacity onPress={() => handleDelete(merchant, count)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {i < merchants.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Bottom merge bar in selection mode */}
      {selecting && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.mergeButton, selected.size < 2 && styles.mergeButtonDisabled]}
            onPress={openMergeFromSelection}
            disabled={selected.size < 2}
          >
            <Ionicons name="git-merge-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.mergeButtonText}>{t('merchants.merge')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Single rename modal */}
      <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={closeRename}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeRename} />
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
              <TouchableOpacity style={styles.cancelButton} onPress={closeRename}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSaveRename}
                disabled={saving}
              >
                <Text style={styles.saveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Merge modal */}
      <Modal visible={mergeSources !== null} transparent animationType="slide" onRequestClose={closeMerge}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeMerge} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('merchants.mergeTitle')}</Text>
            <Text style={styles.mergeLabel}>{t('merchants.mergeInto')}</Text>
            <TextInput
              style={styles.input}
              value={mergeName}
              onChangeText={setMergeName}
              placeholder={t('merchants.renamePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              autoCapitalize="words"
            />
            <Text style={styles.mergeCount}>{t('merchants.mergeCount', { count: mergeExpenseCount })}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeMerge}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleConfirmMerge}
                disabled={saving}
              >
                <Text style={styles.saveText}>{t('merchants.merge')}</Text>
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
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
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
  // Suggestion banner
  suggestion: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  suggestionHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  suggestionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  suggestionBody: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[3] },
  suggestionActions: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  dismissButton: { paddingVertical: theme.spacing[2], paddingHorizontal: theme.spacing[1] },
  dismissText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  suggestionMergeButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  suggestionMergeText: {
    ...theme.textStyles.bodyMedium, color: theme.colors.textInverse,
    textAlign: 'center' as const,
  },
  // Bottom merge bar
  bottomBar: {
    paddingHorizontal: theme.spacing[4], paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1, borderTopColor: theme.colors.divider,
  },
  mergeButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3.5], borderRadius: theme.borderRadius.lg,
  },
  mergeButtonDisabled: { opacity: 0.5 },
  mergeButtonText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
  // Modals
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
  mergeLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16, color: theme.colors.textPrimary, marginBottom: theme.spacing[4],
  },
  mergeCount: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginBottom: theme.spacing[4] },
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
