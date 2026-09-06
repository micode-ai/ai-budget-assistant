import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useProductMultiSelect } from '@/hooks/useProductMultiSelect';
import { BulkActionBar } from '@/components/BulkActionBar';
import { RenameProductModal } from '@/components/settings/RenameProductModal';
import { MergeProductsModal } from '@/components/settings/MergeProductsModal';
import { SettingsScreenList } from '../SettingsScreenList';
import { useSettingsPane } from '../SettingsPaneContext';
import type { ProductListItem } from '@budget/shared-types';

/**
 * Rows the pane renders before withholding the rest behind "+N more".
 *
 * A pane has no scroller of its own, so an uncapped list is rendered whole, in
 * one commit: a production account with ~1,120 products measured 12,359 DOM
 * elements and 67,894px of content. 100 is round -- plainly a cap rather than a
 * coincidence -- and an order of magnitude below where the cost showed up, so
 * most accounts never meet the affordance at all. If it is wrong it is one
 * constant.
 *
 * Desktop only. The phone keeps its `FlatList`, which genuinely windows there.
 */
const PANE_MAX_ROWS = 100;

/**
 * The products screen's body: the tracked-product list with rename, ignore,
 * multi-select merge and the AI re-analysis backfill.
 *
 * Lifted out of `app/settings/products.tsx` unchanged so the desktop settings
 * shell can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Four differences from the original body, each required by that hosting, then two
 * notes about what deliberately did NOT move.
 *
 * **The outer `SafeAreaView` is gone.** `SettingsScreenFrame` supplies it on the
 * full-page path, with the same `edges={[]}` and the same background.
 *
 * **The root `FlatList` is `SettingsScreenList`.** This is the first extracted
 * settings screen whose root scroller is virtualized, and a `FlatList` cannot be
 * left in a pane because it is a second scroll container. The full-page branch
 * is today's `FlatList` with every prop forwarded unchanged, and it is the one
 * that virtualizes: in a pane every row is rendered, so the pane path is capped
 * at `PANE_MAX_ROWS` with a "+N more" affordance instead. See that component for
 * the measurement, and for the correction of an earlier claim in this comment
 * that a `FlatList` there would have stopped at twenty rows -- it would not.
 *
 * **The search filters before the cap, and that ordering is load-bearing.**
 * `filteredProducts` filters the whole `products` array and the cap is applied
 * to the result, so narrowing finds any product no matter how long the list is.
 * Capping first would make a product unreachable by searching for it, which is
 * worse than any row count.
 *
 * **The scroll padding reads `useSettingsPane().bottomInset`** rather than
 * `useSafeAreaInsets()`: the same number on a phone, and nothing in a pane,
 * where the shell has already accounted for the system inset. `useSafeAreaInsets`
 * stays for the docked merge bar, which is bottom-anchored and must clear the
 * navigation bar wherever its opener is rendered (ABA-483). It no longer feeds
 * the two sheets, and they no longer take a `bottomInset` prop: both are
 * `SheetDialog`s, and that wrapper reads the safe area itself.
 *
 * **The merge bar has two renderings, and the fork is here rather than inside
 * `BulkActionBar`**, exactly as on the merchants screen. The docked bar is the
 * phone's: it reaches the bottom of the viewport only because the list above it
 * is `flex: 1` inside `SettingsScreenFrame`'s `SafeAreaView`, and in a pane that
 * `flex: 1` is inert. On the desktop path it is a `BulkActionBar` in normal flow
 * immediately above the rows - appended after the list header, which is what
 * "immediately above the content it acts on" means for a list whose buttons and
 * search box ARE its header - and the docked bar is not rendered at all. The
 * fork reads `useSettingsPane().desktop` rather than re-deriving the width with
 * `useIsDesktopWeb()`, because the condition that makes a docked bar impossible
 * is precisely the condition `SettingsScreenList` branches on.
 *
 * **The stack header's title is NOT set here.** The route file keeps the
 * `<Stack.Screen options={{ title }} />` that overrides `app/_layout.tsx`'s
 * `settingsNav.products` with `priceHistory.manageProducts` - this is the one
 * settings route that does so, and removing it would rename the header on the
 * phone. It stays route chrome: a pane has no stack header at all, and a
 * component under `src/` that renamed whichever route happened to host it would
 * be a trap for the next screen that hosts this one.
 *
 * **The list's separator and `openRename` are memoised, and that is a fix, not
 * tidiness.** An inline `ItemSeparatorComponent` arrow is a fresh component
 * TYPE on every render, so React unmounted and remounted every separator in
 * the list instead of diffing it - on the phone that is every separator the
 * `FlatList` currently has mounted, on every keystroke in the search box. And
 * `openRename` sits in `renderItem`'s dep array, so while it was redefined
 * each render `renderItem`'s memo could never hold. Neither changes a pixel.
 *
 * **Do not add a poll or an interval here.** A pane stays mounted while another
 * pane is read - `SettingsNav` pushes, and a stack push does not unmount the
 * screen beneath - so a timer a phone would have stopped by unmounting keeps
 * running for as long as the settings area is open. The AI backfill's in-flight
 * flag is a plain `useState` and is safe for the same reason it is unremarkable
 * on the phone: it is only ever written by the handler that owns it, and a pane
 * lives at least as long as the route it replaced.
 *
 * **A backfill that outlives the account it was issued for says nothing.** Both
 * of its alerts are suppressed when `currentAccountId` has changed across the
 * await, and the reason is not that the count would be wrong - it is right, for
 * account A. It is that by the time it resolves it describes work on a list the
 * user is no longer looking at, and there is no correct number to quote instead:
 * the count comes from the server for the account the request was issued under,
 * and deriving one for account B would mean running a backfill on B that nobody
 * asked for. An alert naming an account you have left is also unactionable - you
 * would have to switch back to see what it refers to.
 *
 * Both alerts, symmetrically. Suppressing only the success would turn a silent
 * success into a visible failure on exactly the switch that made it irrelevant,
 * which is worse than either. `setIsBackfilling(false)` is deliberately outside
 * that guard: the button must leave "Analyzing..." whatever happened, and the
 * pane is still mounted to show it.
 *
 * The work itself is unaffected - it completed on the server for account A, and
 * A's list shows it the next time that account is opened. The backfill is not
 * cancelled, only its report withheld.
 */
export function ProductsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { desktop, bottomInset } = useSettingsPane();
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const { products, isLoadingProducts, loadProducts, upsertAlias, deleteAlias, ignoreProduct, mergeProducts, backfillWithAi } =
    usePriceHistoryStore();

  // Keyed on the account, matching the analytics screen's cadence for the same
  // store: the list is scoped server-side to `X-Account-Id`, so a switch has to
  // refill it. `accountStore` has already emptied the store by the time this
  // runs, so the switch cannot paint the previous account's products while the
  // fetch is in flight, nor leave them on screen if it fails.
  useEffect(() => { loadProducts(); }, [currentAccountId]);

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
            // Capture-then-recheck around the await, the shape
            // `walletStore.loadWallet` uses for the same hazard. Read live from
            // `getState()` on both sides rather than from the subscribed
            // `currentAccountId`: this runs from an alert callback, so the
            // render that created the handler may be several account switches
            // old, and only the value at the moment the request is ISSUED is
            // the one the answer will describe.
            const issuedFor = useAccountStore.getState().currentAccountId;
            setIsBackfilling(true);
            try {
              const { updatedCount } = await backfillWithAi();
              if (useAccountStore.getState().currentAccountId === issuedFor) {
                showAlert('', t('priceHistory.reanalyzeSuccess', { count: updatedCount }));
              }
            } catch (e) {
              if (useAccountStore.getState().currentAccountId === issuedFor) {
                showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
              }
            }
            setIsBackfilling(false);
          },
        },
      ],
    );
  };

  const [searchQuery, setSearchQuery] = useState('');

  // Multi-select + merge
  const { selecting, selected, toggleSelect, enterSelect, exitSelect } = useProductMultiSelect();
  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');

  // `useCallback` with no deps, not a plain function: `renderItem` lists this
  // in its own dep array, so while it was redefined every render `renderItem`
  // was too, and its memo never held. Both setters are stable.
  const openRename = useCallback((item: ProductListItem) => {
    setEditing(item);
    setRenameName(item.canonicalName);
  }, []);
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
            // Delete all aliases in this group (merged products share a canonicalName)
            try {
              await Promise.all(item.rawNames.map((rn) => deleteAlias(rn)));
            } catch { /* warn'd */ }
          },
        },
      ],
    );
  }, [deleteAlias, t]);

  const handleIgnore = useCallback((item: ProductListItem) => {
    showAlert(
      t('priceHistory.ignoreProduct'),
      t('priceHistory.ignoreConfirm', { name: item.canonicalName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('priceHistory.ignoreProduct'),
          style: 'destructive',
          onPress: async () => {
            closeRename();
            try {
              await Promise.all(item.rawNames.map((rn) => ignoreProduct(rn)));
            } catch { /* warn'd */ }
          },
        },
      ],
    );
  }, [ignoreProduct, t]);

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

  const mergeLabel = useMemo(
    () =>
      mergeSources
        ?.map((s) => products.find((x) => x.rawName === s)?.canonicalName ?? s)
        .join(' + ') ?? '',
    [mergeSources, products],
  );

  const handleConfirmMerge = async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) return;
    // Expand each selected primary rawName to all rawNames in its group
    const allRawNames = mergeSources.flatMap(
      (primaryRaw) => products.find((p) => p.rawName === primaryRaw)?.rawNames ?? [primaryRaw],
    );
    setSaving(true);
    try { await mergeProducts(allRawNames, target); } catch { /* warn'd */ }
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('priceHistory.merged'));
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredProducts = useMemo(
    () =>
      q
        ? products.filter(
            (p) =>
              p.canonicalName.toLowerCase().includes(q) ||
              p.rawName.toLowerCase().includes(q),
          )
        : products,
    [products, q],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: typeof filteredProducts[0]; index: number }) => {
      const isFirst = index === 0;
      const isLast = index === filteredProducts.length - 1;
      const isSelected = selected.has(item.rawName);
      const hasAlias = item.rawName !== item.canonicalName;
      return (
        <View
          style={[
            styles.itemWrap,
            isFirst && styles.itemWrapFirst,
            isLast && styles.itemWrapLast,
          ]}
        >
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
                    <Ionicons name="create-outline" size={17} color={theme.colors.textTertiary} />
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
        </View>
      );
    },
    [filteredProducts.length, selected, selecting, canEdit, toggleSelect, openRename, handleResetAlias, t, theme, styles],
  );

  const ListHeader = useMemo(
    () => (
      <View style={styles.listHeaderContainer}>
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
                  {isBackfilling ? t('priceHistory.reanalyzing') : t('priceHistory.reanalyzeWithAi')}
                </Text>
              </TouchableOpacity>
            )}
            {canEdit && products.length > 1 && (
              <TouchableOpacity
                style={styles.mergeButton}
                onPress={enterSelect}
                activeOpacity={0.75}
              >
                <Ionicons name="git-merge-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.mergeButtonText}>{t('priceHistory.mergeProducts')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
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
            <Text style={styles.sectionTitle}>{t('priceHistory.manageProducts')}</Text>
          )}
        </View>
        {products.length > 0 && (
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={theme.colors.textTertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('common.search')}
              placeholderTextColor={theme.colors.textTertiary}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selecting, selected.size, canEdit, products.length, isBackfilling, searchQuery, t, theme, styles],
  );

  // Desktop: in flow, immediately above the rows it acts on. Appended to the
  // header rather than folded into its memo, so it keeps live closures over
  // `selected` and `products` while `ListHeader` keeps its own dep array
  // untouched — and so the phone is handed exactly the element it is handed
  // today, with no wrapper of any kind. Gated on a non-empty selection, as the
  // transactions list is.
  const listHeader = desktop ? (
    <>
      {ListHeader}
      {selected.size > 0 && (
        <BulkActionBar
          style={styles.bulkBarPlacement}
          label={t('merchants.selected', { count: selected.size })}
        >
          <TouchableOpacity
            style={[styles.mergeBarButton, selected.size < 2 && styles.mergeBtnDisabled]}
            onPress={openMerge}
            disabled={selected.size < 2}
            accessibilityRole="button"
          >
            <Ionicons name="git-merge-outline" size={16} color={theme.colors.textInverse} />
            <Text style={styles.mergeBarButtonText}>{t('priceHistory.mergeProducts')}</Text>
          </TouchableOpacity>
        </BulkActionBar>
      )}
    </>
  ) : (
    ListHeader
  );

  // A stable component TYPE. Written inline this was a fresh arrow on every
  // render, so React saw a different type each time and unmounted and
  // remounted every separator in the list rather than diffing it - about a
  // thousand subtrees per keystroke in the search box on a long list. Only
  // the theme can change what it draws.
  const ItemSeparator = useCallback(
    () => (
      <View style={{ backgroundColor: theme.colors.surface }}>
        <View style={styles.itemSeparator} />
      </View>
    ),
    [theme, styles],
  );

  const ListEmpty = useMemo(
    () => (
      <View style={styles.card}>
        {isLoadingProducts ? (
          <ActivityIndicator color={theme.colors.primary} style={{ paddingVertical: theme.spacing[6] }} />
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="bar-chart-outline" size={32} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>
              {q ? t('common.noResults') : t('priceHistory.noProducts')}
            </Text>
          </View>
        )}
      </View>
    ),
    [isLoadingProducts, q, t, theme, styles],
  );

  return (
    <>
      <SettingsScreenList
        data={isLoadingProducts ? [] : filteredProducts}
        keyExtractor={(item) => item.rawName}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={ListEmpty}
        ItemSeparatorComponent={ItemSeparator}
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + bottomInset }]}
        showsVerticalScrollIndicator={false}
        desktopMaxRows={PANE_MAX_ROWS}
        showMoreLabel={(count) => t('priceHistory.showMore', { count })}
        showMoreStyle={styles.showMoreCard}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews
      />

      {/* Bottom merge bar — the phone's, and only the phone's. It docks because
          the list above it is `flex: 1`, which is exactly what a pane does not
          provide; see the note on the fork above. */}
      {!desktop && selecting && (
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

      <RenameProductModal
        editing={editing}
        renameName={renameName}
        onChangeName={setRenameName}
        saving={saving}
        canEdit={canEdit}
        onClose={closeRename}
        onSave={handleSaveRename}
        onIgnore={handleIgnore}
      />

      <MergeProductsModal
        visible={mergeSources !== null}
        mergeLabel={mergeLabel}
        mergeName={mergeName}
        onChangeName={setMergeName}
        saving={saving}
        onClose={closeMerge}
        onConfirm={handleConfirmMerge}
      />
    </>
  );
}

const createStyles = (theme: Theme) => ({
  content: { padding: theme.spacing[4] },
  listHeaderContainer: { gap: theme.spacing[3], marginBottom: theme.spacing[3] },

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
  mergeButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  mergeButtonText: { fontSize: 14, fontWeight: '600' as const, color: theme.colors.primary },

  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },

  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  searchIcon: { marginRight: 2 },
  searchInput: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    paddingVertical: 2,
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  // Virtualized list items: each row carries the card background.
  // First/last items get the card's border-radius corners.
  itemWrap: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
  },
  itemWrapFirst: {
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    paddingTop: theme.spacing[1],
  },
  itemWrapLast: {
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
    paddingBottom: theme.spacing[1],
  },
  itemSeparator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  // The capped list's "+N more" row is the card's last row, so it carries the
  // card's ground and its bottom corners - the ones `itemWrapLast` would have
  // given the final product row had the list not been cut short.
  showMoreCard: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
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

  // Desktop merge bar: placement only, the box is `BulkActionBar`'s. The pane
  // content is already padded, so this adds no horizontal margin of its own.
  bulkBarPlacement: { marginBottom: theme.spacing[3] },
  mergeBarButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  // `textInverse` and not `onSemantic`: the fill is the accent, not a semantic
  // colour, so the foreground must follow the accent the user picked.
  mergeBarButtonText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textInverse },

  // The phone's docked merge bar.
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
});
