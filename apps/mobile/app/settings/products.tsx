import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ProductListItem } from '@budget/shared-types';

export default function ProductsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());

  const { products, isLoadingProducts, loadProducts, upsertAlias, deleteAlias, mergeProducts, backfillWithAi } =
    usePriceHistoryStore();

  useEffect(() => { loadProducts(); }, []);

  // Single rename
  const [editing, setEditing] = useState<ProductListItem | null>(null);
  const [renameName, setRenameName] = useState('');
  const [saving, setSaving] = useState(false);

  const [isBackfilling, setIsBackfilling] = useState(false);

  const handleBackfill = () => {
    showAlert(
      t('priceHistory.reanalyzeWithAi'),
      t('priceHistory.reanalyzeConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('priceHistory.reanalyzeWithAi'),
          onPress: async () => {
            setIsBackfilling(true);
            try {
              const { updatedCount } = await backfillWithAi();
              showAlert('', t('priceHistory.reanalyzeSuccess', { count: updatedCount }));
            } catch {
              // warn'd in store
            }
            setIsBackfilling(false);
          },
        },
      ],
    );
  };

  // Multi-select + merge
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');

  const toggleSelect = useCallback((rawName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rawName)) next.delete(rawName);
      else next.add(rawName);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const openRename = (item: ProductListItem) => {
    setEditing(item);
    setRenameName(item.canonicalName);
  };
  const closeRename = () => {
    setEditing(null);
    setRenameName('');
  };

  const handleSaveRename = async () => {
    if (!editing) return;
    const next = renameName.trim();
    if (!next || next === editing.canonicalName) { closeRename(); return; }
    setSaving(true);
    try { await upsertAlias(editing.rawName, next); } catch { /* warn'd */ }
    setSaving(false);
    closeRename();
  };

  const handleResetAlias = useCallback((item: ProductListItem) => {
    showAlert(
      t('priceHistory.resetAliasTitle'),
      t('priceHistory.resetAliasBody', { name: item.rawName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('priceHistory.resetAlias'),
          onPress: async () => {
            try { await deleteAlias(item.rawName); } catch { /* warn'd */ }
          },
        },
      ],
    );
  }, [deleteAlias, t]);

  const defaultMergeName = (sources: string[]) => {
    const byCount = new Map(products.map((p) => [p.rawName, p.purchaseCount]));
    return [...sources].sort((a, b) => (byCount.get(b) ?? 0) - (byCount.get(a) ?? 0))[0] ?? '';
  };

  const openMerge = () => {
    const sources = [...selected];
    if (sources.length < 2) return;
    setMergeSources(sources);
    setMergeName(defaultMergeName(sources));
  };
  const closeMerge = () => { setMergeSources(null); setMergeName(''); };

  const handleConfirmMerge = async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) return;
    setSaving(true);
    try { await mergeProducts(mergeSources, target); } catch { /* warn'd */ }
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('priceHistory.merged'));
  };

  return (
    <>
      <Stack.Screen options={{ title: t('priceHistory.manageProducts') }} />
      <SafeAreaView style={styles.container} edges={[]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hint + AI re-analyze */}
          {!selecting && (
            <>
              <View style={styles.hintCard}>
                <Ionicons name="information-circle-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.hintText}>{t('priceHistory.productsHint')}</Text>
              </View>
              {canEdit && products.length > 0 && (
                <TouchableOpacity
                  style={styles.aiButton}
                  onPress={handleBackfill}
                  disabled={isBackfilling}
                  activeOpacity={0.75}
                >
                  {isBackfilling ? (
                    <ActivityIndicator size="small" color={theme.colors.textInverse} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={16} color={theme.colors.textInverse} />
                  )}
                  <Text style={styles.aiButtonText}>
                    {isBackfilling
                      ? t('priceHistory.reanalyzing')
                      : t('priceHistory.reanalyzeWithAi')}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Section header */}
          <View style={styles.sectionHeader}>
            {selecting ? (
              <>
                <Text style={styles.sectionTitle}>
                  {t('merchants.selected', { count: selected.size })}
                </Text>
                <TouchableOpacity onPress={exitSelect} hitSlop={8}>
                  <Text style={styles.headerAction}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{t('priceHistory.manageProducts')}</Text>
                {canEdit && products.length > 1 && (
                  <TouchableOpacity style={styles.mergeChip} onPress={() => setSelecting(true)} hitSlop={8}>
                    <Ionicons name="git-merge-outline" size={13} color={theme.colors.primary} />
                    <Text style={styles.mergeChipText}>{t('priceHistory.mergeProducts')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* List */}
          <View style={styles.card}>
            {isLoadingProducts ? (
              <ActivityIndicator
                color={theme.colors.primary}
                style={{ paddingVertical: theme.spacing[6] }}
              />
            ) : products.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="bar-chart-outline" size={32} color={theme.colors.textTertiary} />
                <Text style={styles.emptyText}>{t('priceHistory.noProducts')}</Text>
              </View>
            ) : (
              products.map((item, i) => {
                const isSelected = selected.has(item.rawName);
                const hasAlias = item.rawName !== item.canonicalName;
                return (
                  <React.Fragment key={item.rawName}>
                    <View style={styles.row}>
                      {selecting ? (
                        <TouchableOpacity
                          style={styles.rowInner}
                          onPress={() => toggleSelect(item.rawName)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isSelected ? theme.colors.primary : theme.colors.textTertiary}
                          />
                          <View style={styles.nameWrap}>
                            <Text style={styles.productName} numberOfLines={2}>{item.canonicalName}</Text>
                            {hasAlias && (
                              <Text style={styles.productSub} numberOfLines={1}>{item.rawName}</Text>
                            )}
                          </View>
                          <Text style={styles.countBadge}>{item.purchaseCount}×</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.rowInner}
                            onPress={canEdit ? () => openRename(item) : undefined}
                            activeOpacity={canEdit ? 0.7 : 1}
                          >
                            <View style={styles.iconCircle}>
                              <Ionicons name="bar-chart-outline" size={16} color={theme.colors.primary} />
                            </View>
                            <View style={styles.nameWrap}>
                              <Text style={styles.productName} numberOfLines={2}>{item.canonicalName}</Text>
                              {hasAlias ? (
                                <Text style={styles.productSub} numberOfLines={1}>{item.rawName}</Text>
                              ) : (
                                <Text style={styles.productSub}>
                                  {t('priceHistory.purchasesCount', { count: item.purchaseCount })}
                                </Text>
                              )}
                            </View>
                            {canEdit && (
                              <Ionicons
                                name="create-outline"
                                size={17}
                                color={theme.colors.textTertiary}
                              />
                            )}
                          </TouchableOpacity>
                          {canEdit && hasAlias && (
                            <TouchableOpacity
                              onPress={() => handleResetAlias(item)}
                              hitSlop={10}
                              style={styles.resetBtn}
                            >
                              <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                    {i < products.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Bottom merge bar */}
        {selecting && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={[styles.mergeBtn, selected.size < 2 && styles.mergeBtnDisabled]}
              onPress={openMerge}
              disabled={selected.size < 2}
            >
              <Ionicons name="git-merge-outline" size={18} color={theme.colors.textInverse} />
              <Text style={styles.mergeBtnText}>
                {t('priceHistory.mergeSelected', { count: selected.size })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Rename modal */}
        <Modal visible={editing !== null} transparent animationType="slide" onRequestClose={closeRename}>
          <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeRename} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
              <View style={styles.handle} />
              <Text style={styles.modalTitle}>{t('priceHistory.renameProduct')}</Text>
              {editing?.rawName !== editing?.canonicalName && (
                <Text style={styles.modalSub}>{editing?.rawName}</Text>
              )}
              <TextInput
                style={styles.input}
                value={renameName}
                onChangeText={setRenameName}
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                autoCapitalize="words"
              />
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeRename}>
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
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
              <Text style={styles.modalTitle}>{t('priceHistory.mergeProducts')}</Text>
              <Text style={styles.modalSub} numberOfLines={2}>
                {mergeSources
                  ?.map((s) => products.find((x) => x.rawName === s)?.canonicalName ?? s)
                  .join(' + ')}
              </Text>
              <Text style={styles.fieldLabel}>{t('priceHistory.mergeInto')}</Text>
              <TextInput
                style={styles.input}
                value={mergeName}
                onChangeText={setMergeName}
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                autoCapitalize="words"
              />
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeMerge}>
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleConfirmMerge}
                  disabled={saving}
                >
                  <Text style={styles.saveText}>{t('priceHistory.mergeProducts')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], gap: theme.spacing[3] },

  hintCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary + '14',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
  },
  hintText: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flex: 1, lineHeight: 18 },
  aiButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  aiButtonText: { fontSize: 14, fontWeight: '600' as const, color: theme.colors.textInverse },

  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  mergeChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  mergeChipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  rowInner: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 44,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexShrink: 0,
  },
  nameWrap: { flex: 1 },
  productName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  productSub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  countBadge: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flexShrink: 0 },
  resetBtn: { paddingLeft: theme.spacing[2] },
  divider: { height: 1, backgroundColor: theme.colors.divider },

  emptyWrap: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[2],
  },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textTertiary, textAlign: 'center' as const },

  bottomBar: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  mergeBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
  },
  mergeBtnDisabled: { opacity: 0.45 },
  mergeBtnText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },

  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  modalSub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  fieldLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  rowActions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
