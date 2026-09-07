import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { useMerchantSuggestionStore } from '@/stores/merchantSuggestionStore';
import { useMerchantRulesStore } from '@/stores/merchantRulesStore';
import { getMerchantCounts, suggestMerchantGroups } from '@/utils/merchant';
import { useTheme, useStyles, type Theme } from '@/theme';
import { BulkActionBar } from '@/components/BulkActionBar';
import { SettingsScreenScroll } from '../SettingsScreenScroll';
import { useSettingsPane } from '../SettingsPaneContext';

/**
 * Stable accessible-name ids for the two sheets' titles, wired to the desktop
 * dialogs' `aria-labelledby`. Fixed ids are safe for the same reason
 * `ExpenseDialog.tsx`'s is: only one sheet is ever open at a time.
 */
const RENAME_SHEET_TITLE_ID = 'merchant-rename-sheet-title';
const MERGE_SHEET_TITLE_ID = 'merchant-merge-sheet-title';

/**
 * The merchants screen's body: the merchant list with its rename / merge /
 * delete actions, the grouping-suggestion banners, and the merchant -> category
 * rules learned from manual corrections.
 *
 * Lifted out of `app/settings/merchants.tsx` unchanged so the desktop settings
 * shell can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same background),
 * and the root `ScrollView` is `SettingsScreenScroll` - the same `ScrollView`
 * full-page, a plain `View` in a pane, because the shell owns the page scroll
 * and a nested scroller would be the second scrollbar the language forbids.
 *
 * **The root here is a bare `ScrollView`, not a `KeyboardAwareScreen`.** The
 * `KeyboardAvoidingScreen` this file imports wraps the two *modals*, not the
 * page, so it is untouched and `SettingsScreenKeyboardScroll` - written for
 * `security`, whose root really is one - is deliberately not used. Which
 * wrapper a screen reaches for is a fact about that screen, read from its tree
 * rather than from its import list.
 *
 * **The merge bar has two renderings, and the fork is here rather than inside
 * `BulkActionBar`.** The docked bar is the phone's: it is a sibling of the
 * scroller and reaches the bottom of the viewport only because that scroller is
 * `flex: 1` inside `SettingsScreenFrame`'s `SafeAreaView`. In a pane that
 * `flex: 1` is inert - the desktop branch of `SettingsScreenScroll` applies only
 * `contentContainerStyle` - so the same bar fell into normal flow *below* the
 * category-rules card, putting the button that acts on a selection an entire
 * section's scroll away from the selection. On the desktop path it is a
 * `BulkActionBar` in normal flow immediately above the merchant list instead,
 * which removes that distance rather than working around it, and the docked bar
 * is not rendered at all. The phone keeps today's tree byte for byte.
 *
 * The fork reads `useSettingsPane().desktop` rather than re-deriving the width
 * with `useIsDesktopWeb()`. They agree today - `SettingsRoute` computes one from
 * the other - but the condition that makes the docked bar impossible is
 * precisely the condition `SettingsScreenScroll` branches on, so asking the same
 * source keeps the two from ever disagreeing about which layout is in force.
 *
 * `useSafeAreaInsets` stays, and is deliberately NOT swapped for
 * `useSettingsPane().bottomInset`: it feeds the phone's docked merge bar, which
 * must clear the system navigation bar wherever its opener is rendered
 * (ABA-483), and is not this screen's scroll padding, which carries no inset
 * today and still does not. It no longer feeds the two sheets - those are
 * `SheetDialog`s now, and that wrapper owns the same inset rule for every sheet
 * in one place.
 *
 * **The rules effect is keyed on `currentAccountId`, and that is load-bearing
 * here in a way it is not on the phone.** `merchantRulesStore.isLoaded` is a
 * lazy-load guard that `accountStore` clears on an account switch (ABA-511);
 * a pane stays mounted across such a switch, so an empty dep array would never
 * refill it and the rules card would sit permanently blank. Do not narrow that
 * dep.
 */
export function MerchantsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { desktop } = useSettingsPane();
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const expenses = useExpenseStore((s) => s.expenses);
  const renameMerchant = useExpenseStore((s) => s.renameMerchant);
  const mergeMerchants = useExpenseStore((s) => s.mergeMerchants);
  const merchants = useMemo(() => getMerchantCounts(expenses), [expenses]);
  const countByMerchant = useMemo(
    () => new Map(merchants.map((m) => [m.merchant, m.count])),
    [merchants],
  );

  // Merchant category rules
  const rules = useMerchantRulesStore((s) => s.rules);
  const isRulesLoaded = useMerchantRulesStore((s) => s.isLoaded);
  const loadRules = useMerchantRulesStore((s) => s.loadRules);
  const deleteRule = useMerchantRulesStore((s) => s.deleteRule);

  // Keyed on the account: the rules are scoped server-side to `X-Account-Id`.
  // `accountStore` clears `isLoaded` on a switch, so this re-fetches then while
  // a plain revisit still reads the cache.
  React.useEffect(() => {
    if (!isRulesLoaded) loadRules();
  }, [currentAccountId]);

  const handleDeleteRule = (id: string, merchant: string) => {
    showAlert(
      t('merchants.categoryRules'),
      t('merchants.ruleDeleteConfirm', { merchant }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteRule(id).then(() => showAlert('', t('merchants.ruleDeleted'))),
        },
      ],
    );
  };

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
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
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

        {/* Desktop: in flow, immediately above the list it acts on - a sibling of
            the card, not its header. Gated on a non-empty selection, as the
            transactions list is, so nothing is reserved before there is
            anything to act on. */}
        {desktop && selected.size > 0 && (
          <BulkActionBar
            style={styles.bulkBarPlacement}
            label={t('merchants.selected', { count: selected.size })}
          >
            <TouchableOpacity
              style={[styles.mergeBarButton, selected.size < 2 && styles.mergeButtonDisabled]}
              onPress={openMergeFromSelection}
              disabled={selected.size < 2}
              accessibilityRole="button"
            >
              <Ionicons name="git-merge-outline" size={16} color={theme.colors.textInverse} />
              <Text style={styles.mergeBarButtonText}>{t('merchants.merge')}</Text>
            </TouchableOpacity>
          </BulkActionBar>
        )}

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

        {/* Category rules section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('merchants.categoryRules')}</Text>
        </View>

        <View style={styles.card}>
          {rules.length === 0 ? (
            <Text style={styles.empty}>{t('merchants.noRules')}</Text>
          ) : (
            rules.map((rule, i) => (
              <React.Fragment key={rule.id}>
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Ionicons
                      name={(rule.categoryIcon as any) ?? 'pricetag-outline'}
                      size={18}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.nameContainer}>
                    <Text style={styles.name} numberOfLines={1}>{rule.merchantNormalized}</Text>
                    <Text style={styles.sub}>{rule.categoryName}</Text>
                  </View>
                  {canEdit && (
                    <TouchableOpacity
                      onPress={() => handleDeleteRule(rule.id, rule.merchantNormalized)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
                {i < rules.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
        </View>
      </SettingsScreenScroll>

      {/* Bottom merge bar in selection mode - the phone's, and only the phone's.
          It docks because the scroller above it is `flex: 1`, which is exactly
          what a pane does not provide; see the note on the fork above. */}
      {!desktop && selecting && (
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

      {/* Single rename sheet */}
      <SheetDialog
        visible={editing !== null}
        onClose={closeRename}
        titleId={RENAME_SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
        scrimColor="rgba(0,0,0,0.4)"
      >
        <Text nativeID={RENAME_SHEET_TITLE_ID} style={styles.modalTitle}>{t('merchants.renameTitle')}</Text>
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
      </SheetDialog>

      {/* Merge sheet */}
      <SheetDialog
        visible={mergeSources !== null}
        onClose={closeMerge}
        titleId={MERGE_SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
        scrimColor="rgba(0,0,0,0.4)"
      >
        <Text nativeID={MERGE_SHEET_TITLE_ID} style={styles.modalTitle}>{t('merchants.mergeTitle')}</Text>
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
      </SheetDialog>
    </>
  );
}

const createStyles = (theme: Theme) => ({
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
  // Desktop merge bar: placement only, the box is `BulkActionBar`'s. The pane
  // content is already padded, so this adds no horizontal margin of its own.
  bulkBarPlacement: { marginBottom: theme.spacing[2] },
  mergeBarButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  // `textInverse` and not `onSemantic`: the fill is the accent, not a semantic
  // colour, so the foreground must follow the accent the user picked.
  mergeBarButtonText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textInverse },
  // Phone's docked merge bar
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
