import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useExpensesScreenData, type ActiveTab } from '@/features/expenses/useExpensesScreenData';
import { rowId, facetValue, type ActiveFacets, type LedgerRow } from '@/features/expenses/desktopTable';
import { trimToVisible } from '@/features/expenses/desktopSelection';
import { ExpenseMapView } from '@/components/map/ExpenseMapView';
import { buildExpenseMapPoints } from '@/components/map/buildMapPoints';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { BulkTagPickerSheet } from '@/components/BulkTagPickerSheet';
import { BulkActionBar } from '@/components/BulkActionBar';
import { SummaryStrip } from './SummaryStrip';
import { TransactionTable } from './TransactionTable';
import { FacetRail, FacetRailTrigger, type KindFacet, type PeriodFacet } from './FacetRail';
import { ExpenseDialog } from './ExpenseDialog';
import { CreateDialog } from './CreateDialog';
import { RowContextMenu } from './RowContextMenu';

/** The Map toggle only ever applied to the expenses stream (income carries no
 *  location) — mirrors the exact conditional `ExpensesMobile` uses, so a
 *  behaviour that already existed there isn't lost here. */
function isExpensesTab(tab: ActiveTab): boolean {
  return tab === 'expenses';
}

/**
 * Strict intersection, both directions — no kind is exempt from a group.
 * `Income` has its own `categoryId` (`packages/shared-types/src/entities/income.ts`;
 * `TransactionTable`'s `rowCategoryId` already reads and renders it), so an
 * income row matches a chosen `categoryId` set iff its own categoryId is in
 * it, exactly like an expense row. `merchant` is the one field genuinely
 * absent from `Income`, so an income row never matches a chosen `merchant`
 * set, full stop — reusing `desktopTable.ts`'s `facetValue` (the single place
 * that decides which field a row has for a given key) is what keeps this in
 * lockstep with `facetCounts`/`countsForFacet`, which apply the identical
 * rule when computing the counts shown beside each option.
 *
 * (An earlier version of this function let ANY selection vacuously pass for
 * income, reasoning that `facetCounts` only ever counts expenses anyway. That
 * was built around a trap that doesn't actually exist: `countsForFacet`
 * already narrows every OTHER group's counts by whatever is active, so
 * picking a facet that would produce zero income rows shows 0 right there in
 * the rail before the user clicks — the same mechanism that prevents a
 * confusing empty result for any other combination.)
 */
function matchesDynamicFacet(row: LedgerRow, chosen: string[], key: 'categoryId' | 'merchant'): boolean {
  if (chosen.length === 0) return true;
  if (key === 'merchant' && row.kind !== 'expense') return false;
  const value = facetValue(row, key);
  const bucket = typeof value === 'string' && value.length > 0 ? value : '';
  return chosen.includes(bucket);
}

/**
 * Desktop transactions screen (design spec decision 3): a facet rail beside
 * a summary strip and a day-grouped table, all fed by ONE merged expense+
 * income row set (decision 8). The facet rail (task 4) is what narrows that
 * merged set — period and kind (the mobile tab, now a facet) are applied
 * first, then category/merchant (the two `desktopTable.ts` `FacetGroup`
 * members this rail renders — see `FacetRail.tsx`). A row click opens
 * `ExpenseDialog` (task 5); the checkbox column, shift-click, and the row
 * context menu (task 6) drive bulk actions on top of that same row set.
 */
export function ExpensesDesktop() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const collapsed = width < FACET_RAIL_MIN_WIDTH;

  const {
    activeTab,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    expenseFilters,
    setExpenseFilters,
    incomeFilters,
    setIncomeFilters,
    expenses,
    incomes,
    baseCurrency,
    canEdit,
    expensesLoading,
    incomesLoading,
    multiSelect,
    handleLongPress,
    handleDuplicate,
    handleDeleteFromList,
    categories,
    allTags,
  } = useExpensesScreenData();

  // Trip Expense Splitting (Group Trip Wallet): only relevant for `trip`
  // accounts — a complete no-op (no member fetch, no extra props) for every
  // other account type. Mirrors `app/expense/[id].tsx`'s identical block, so
  // the dialog hosting `ExpenseDetailsCard` gets the same trip context that
  // screen already provides it.
  const currentAccount = useAccountStore((s) => s.currentAccount());
  const accountMembersMap = useAccountStore((s) => s.members);
  const loadMembers = useAccountStore((s) => s.loadMembers);
  const isTripAccount = currentAccount?.type === 'trip';
  const tripMembers = isTripAccount && currentAccount
    ? (accountMembersMap[currentAccount.id] || []).map((m) => ({
        userId: m.userId,
        name: m.user?.name || m.user?.email || m.userId,
      }))
    : [];

  useEffect(() => {
    if (isTripAccount && currentAccount) {
      loadMembers(currentAccount.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, isTripAccount]);

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  // Fix round 1: whether the dialog about to open for `selectedRowId` should
  // seed straight into edit mode. Set `true` only by the row context menu's
  // Edit action (below); a plain row click always opens read-only, matching
  // the pre-existing behaviour for that path.
  const [dialogInitialEditing, setDialogInitialEditing] = useState(false);
  // Task 3 (ABA-500): which create dialog is open, if any. `handleAddExpense`
  // (from `useExpensesScreenData`) stays untouched — it navigates to
  // `/expense/new` and is still what the mobile FAB uses; desktop's own "+"
  // buttons open `CreateDialog` in place instead, so they set this directly
  // rather than calling that handler.
  const [createKind, setCreateKind] = useState<'expense' | 'income' | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [kind, setKind] = useState<KindFacet>('all');
  const [active, setActive] = useState<ActiveFacets>({ categoryId: [], accountId: [], merchant: [] });

  // The mobile store's OWN category/merchant filters are single-select
  // (`categoryId: string | null`) or expense-only (`merchants`) — incompatible
  // with this rail's multi-select, both-streams design (design spec decision
  // 8 + task brief's "the semantics the existing merchant filter already
  // uses"). Neutralising them once on mount stops a lingering mobile-set
  // filter (e.g. from a live browser resize down to mobile width, picking
  // something there via `ExpenseFilterBar`, then back up to desktop) from
  // silently narrowing `expenses`/`incomes` a SECOND time underneath this
  // rail's own filtering, invisible to anything rendered here. `dateRange`/
  // `searchQuery` are left alone — this rail reuses those two as-is.
  useEffect(() => {
    if (expenseFilters.categoryId !== null || expenseFilters.merchants.length > 0 || incomeFilters.categoryId !== null) {
      setExpenseFilters({ categoryId: null, merchants: [] });
      setIncomeFilters({ categoryId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Both streams, always — decision 8. `expenses`/`incomes` are already
  // period-filtered (the period facet writes straight into the same store
  // filters `getFilteredExpenses`/`getFilteredIncomes` already read); the
  // kind/category/merchant facets narrow further, below.
  const rows: LedgerRow[] = useMemo(
    () => [
      ...expenses.map((expense) => ({ kind: 'expense' as const, expense })),
      ...incomes.map((income) => ({ kind: 'income' as const, income })),
    ],
    [expenses, incomes]
  );

  // Resolved from the FULL (pre-facet, pre-kind) row set, deliberately — a
  // row the user opened stays open even if a filter narrowed it out of view
  // in the meantime (impossible today, since the table beneath a modal is
  // unreachable, but resolving from the unfiltered set costs nothing and
  // avoids the dialog going blank under a future change to when facets can
  // update). `undefined` (row deleted/synced away while open) collapses to
  // `null`, which un-renders the dialog rather than crashing on a stale ref.
  const selectedRow = useMemo(
    () => rows.find((r) => rowId(r) === selectedRowId) ?? null,
    [rows, selectedRowId]
  );
  const closeDialog = () => {
    setSelectedRowId(null);
    setDialogInitialEditing(false);
  };

  const kindNarrowedRows = useMemo(() => {
    if (kind === 'all') return rows;
    return rows.filter((r) => (kind === 'expenses' ? r.kind === 'expense' : r.kind === 'income'));
  }, [rows, kind]);

  // Union within a group (`chosen.includes(...)`), intersection across groups
  // (both checks must pass) — the semantics the mobile merchant filter
  // already used, now applied to category too.
  const visibleRows = useMemo(
    () =>
      kindNarrowedRows.filter(
        (r) =>
          matchesDynamicFacet(r, active.categoryId, 'categoryId') && matchesDynamicFacet(r, active.merchant, 'merchant')
      ),
    [kindNarrowedRows, active]
  );

  const visibleExpenses = useMemo(
    () => visibleRows.flatMap((r) => (r.kind === 'expense' ? [r.expense] : [])),
    [visibleRows]
  );
  const { points: mapPoints, missingCount } = useMemo(() => buildExpenseMapPoints(visibleExpenses), [visibleExpenses]);

  // Task 6 — the SET of currently visible, bulk-selectable ids: expense rows
  // only (constraint 1 — the hook behind `multiSelect` is typed `Expense[]`
  // and everything behind it ends at `PATCH /expenses/bulk`), after every
  // facet (constraint 3). Order doesn't matter here — this feeds only
  // membership checks (the trim effect below), never `rangeBetween`, which
  // needs the table's own RENDERED order and is resolved inside
  // `TransactionTable` from its own day-grouping/sort state.
  const visibleSelectableIds = useMemo(() => visibleExpenses.map((e) => e.id), [visibleExpenses]);

  // Judgment call: narrowing a facet UNDER an active selection TRIMS it down
  // to whatever is still visible, rather than leaving it untouched (a bulk
  // action could then silently act on a row the user can no longer see —
  // exactly what constraint 2's "selectIds, never selectAll" rule exists to
  // prevent for the header checkbox) or clearing it outright (which would
  // needlessly discard a selection the very next facet click might restore
  // in full). Deliberately keyed on `visibleSelectableIds` alone, not
  // `multiSelect.selectedIds` — this must react to the FACETS changing, not
  // to every selection change it itself causes, which would self-trigger
  // without ever settling.
  useEffect(() => {
    const trimmed = trimToVisible(multiSelect.selectedIds, visibleSelectableIds);
    if (trimmed !== null) {
      multiSelect.selectIds(trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSelectableIds]);

  // Row context menu (Step 3) — presentation state (which row, anchored
  // where) owned here. Duplicate/Delete reuse `useExpensesScreenData`'s own
  // `handleDuplicate`/`handleDeleteFromList`, unchanged. Edit does NOT reuse
  // `handleEdit` (fix round 1) — that navigates to `/expense/[id]`, the exact
  // screen decision 4 replaced with this dialog, which would give the row
  // two different "open this" destinations depending on whether the user
  // clicked it or opened its menu. Edit instead opens `ExpenseDialog` itself
  // with `initialEditing` — see the JSX below and `ExpenseDialog`'s own prop
  // doc.
  const [menuState, setMenuState] = useState<{ row: LedgerRow; anchor: { x: number; y: number } } | null>(null);
  const closeMenu = () => setMenuState(null);
  const openMenu = (row: LedgerRow, anchor: { x: number; y: number }) => {
    // Primes `selectedTransaction` inside `useExpensesScreenData()` — the
    // SAME state `handleLongPress` sets for mobile's long-press sheet — so
    // that by the time the user clicks Duplicate or Delete (a later,
    // separate interaction, after this render has committed),
    // `handleDuplicate`/`handleDeleteFromList` read the row THIS menu was
    // opened for. Also flips mobile's own `actionSheetVisible` flag, which is
    // harmless here — this screen never renders `<TransactionActionSheet>`.
    handleLongPress(row.kind === 'expense' ? row.expense : row.income, row.kind);
    setMenuState({ row, anchor });
  };

  const period = expenseFilters.dateRange;
  const customMonth = expenseFilters.customMonth ?? new Date().getMonth();
  const customYear = expenseFilters.customYear ?? new Date().getFullYear();

  const handlePeriodChange = (next: PeriodFacet) => {
    if (next === 'custom') {
      const now = new Date();
      const update = { dateRange: next, customMonth: now.getMonth(), customYear: now.getFullYear() };
      setExpenseFilters(update);
      setIncomeFilters(update);
    } else {
      setExpenseFilters({ dateRange: next });
      setIncomeFilters({ dateRange: next });
    }
  };

  const handleCustomMonthChange = (month: number, year: number) => {
    setExpenseFilters({ customMonth: month, customYear: year });
    setIncomeFilters({ customMonth: month, customYear: year });
  };

  const toggleFacetValue = (group: 'categoryId' | 'merchant', value: string) => {
    setActive((prev) => {
      const list = prev[group];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [group]: next };
    });
  };

  const clearFacetGroup = (group: 'categoryId' | 'merchant') => {
    setActive((prev) => ({ ...prev, [group]: [] }));
  };

  const clearAllFacets = () => {
    setActive({ categoryId: [], accountId: [], merchant: [] });
    setKind('all');
    handlePeriodChange('all');
  };

  // "How many facet GROUPS currently narrow the view" — not a raw count of
  // selected values, so picking 3 categories still reads as one active
  // filter. Counted whenever a group is away from its neutral/"everything"
  // value; period defaults to 'month' (the store's own default), so a brand
  // new desktop session already reads as 1 — that filter was always silently
  // there before this task, just never surfaced.
  const activeFacetCount =
    (period !== 'all' ? 1 : 0) +
    (kind !== 'all' ? 1 : 0) +
    (active.categoryId.length > 0 ? 1 : 0) +
    (active.merchant.length > 0 ? 1 : 0);

  const handleSearchChange = (text: string) => {
    // The mobile `handleSearchChange` writes only whichever store matches
    // `activeTab`; here BOTH streams are always on screen, so both filters
    // need the same query or one of the two streams would silently stop
    // responding to the search box.
    setSearchQuery(text);
    setExpenseFilters({ searchQuery: text });
    setIncomeFilters({ searchQuery: text });
  };

  const onSelectRow = (row: LedgerRow) => {
    setSelectedRowId(rowId(row));
    // A plain row click always opens read-only — only the context menu's
    // Edit (below) seeds edit mode.
    setDialogInitialEditing(false);
  };

  const showMap = viewMode === 'map' && isExpensesTab(activeTab);

  const facetRailProps = {
    rows: kindNarrowedRows,
    active,
    onToggleCategory: (categoryId: string) => toggleFacetValue('categoryId', categoryId),
    onToggleMerchant: (merchant: string) => toggleFacetValue('merchant', merchant),
    onClearGroup: clearFacetGroup,
    onClearAll: clearAllFacets,
    activeFacetCount,
    period,
    onPeriodChange: handlePeriodChange,
    customMonth,
    customYear,
    onCustomMonthChange: handleCustomMonthChange,
    kind,
    onKindChange: setKind,
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder={t('expenses.searchPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => handleSearchChange('')} accessibilityRole="button">
              <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <View style={styles.topBarRight}>
          {collapsed && (
            <FacetRailTrigger
              activeCount={activeFacetCount}
              open={dropdownOpen}
              onPress={() => setDropdownOpen((v) => !v)}
            />
          )}

          {isExpensesTab(activeTab) && (
            <View style={styles.viewToggle}>
              <Pressable
                onPress={() => setViewMode('list')}
                accessibilityRole="button"
                style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
              >
                <Ionicons
                  name="list-outline"
                  size={16}
                  color={viewMode === 'list' ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text
                  style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}
                >
                  {t('map.listView')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('map')}
                accessibilityRole="button"
                style={[styles.viewToggleButton, viewMode === 'map' && styles.viewToggleButtonActive]}
              >
                <Ionicons
                  name="map-outline"
                  size={16}
                  color={viewMode === 'map' ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text
                  style={[styles.viewToggleText, viewMode === 'map' && styles.viewToggleTextActive]}
                >
                  {t('map.mapView')}
                </Text>
              </Pressable>
            </View>
          )}

          {canEdit && (
            <>
              {/* Income needs its own entry point here: this table shows both
                  streams (decision 8), so an "add" affordance that can only
                  ever produce an expense contradicts what is on screen. Kept
                  secondary — spending is the far more frequent action, and two
                  equally loud primary buttons would say otherwise.
                  Both buttons open `CreateDialog` (task 3) instead of
                  navigating — `handleAddExpense` stays untouched on the hook
                  itself, since the mobile FAB still calls it to navigate to
                  `/expense/new`; only these two desktop buttons no longer
                  call it. */}
              <Pressable
                style={styles.addIncomeButton}
                onPress={() => setCreateKind('income')}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color={theme.colors.success} />
                <Text style={styles.addIncomeButtonText}>{t('incomes.addIncome')}</Text>
              </Pressable>
              <Pressable style={styles.addButton} onPress={() => setCreateKind('expense')} accessibilityRole="button">
                <Ionicons name="add" size={18} color={theme.colors.textInverse} />
                <Text style={styles.addButtonText}>{t('expenses.addExpense')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {collapsed && dropdownOpen && <FacetRail layout="row" {...facetRailProps} />}

      {/* ONE page scroll for the whole screen — filters and rows move together
          and the window's own scrollbar is the only one, instead of a rail
          scroller and a table scroller a few hundred pixels apart. */}
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={styles.body}>
          {!collapsed && <FacetRail layout="stack" {...facetRailProps} />}

        <View style={styles.mainColumn}>
          <SummaryStrip rows={visibleRows} baseCurrency={baseCurrency} />

          {canEdit && multiSelect.selectedIds.size > 0 && (
            <BulkActionBar
              style={styles.bulkBarPlacement}
              label={t('expenses.bulkSelected', { count: multiSelect.selectedIds.size })}
              onClear={multiSelect.exitMultiSelect}
              clearAccessibilityLabel={t('expensesDesktop.clearSelection')}
            >
              {multiSelect.isBulkProcessing ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <>
                  <Pressable
                    style={styles.bulkBarButton}
                    onPress={() => {
                      multiSelect.setShowBulkTagPicker(false);
                      multiSelect.setShowBulkCategoryPicker(true);
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.bulkBarButtonText}>{t('expenses.bulkSetCategory')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.bulkBarButton}
                    onPress={() => {
                      multiSelect.setShowBulkCategoryPicker(false);
                      multiSelect.setShowBulkTagPicker(true);
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name="bookmark-outline" size={16} color={theme.colors.accent} />
                    <Text style={styles.bulkBarButtonText}>{t('expenses.bulkAddTag')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.bulkBarButton}
                    onPress={multiSelect.handleBulkDelete}
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                    <Text style={[styles.bulkBarButtonText, { color: theme.colors.danger }]}>
                      {t('expenses.bulkDelete')}
                    </Text>
                  </Pressable>
                </>
              )}
            </BulkActionBar>
          )}

          {showMap ? (
            <View style={styles.mapContainer}>
              {missingCount > 0 && (
                <View style={styles.mapBanner}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.mapBannerText}>{t('map.noLocationCount', { count: missingCount })}</Text>
                </View>
              )}
              <ExpenseMapView
                points={mapPoints}
                openLabel={t('map.open')}
                onPointPress={(pointId) => {
                  // The same dialog a row click opens, not a navigate — the
                  // map is a view OF this screen, so leaving it to show one
                  // of its own points would undo decision 4 the moment the
                  // user switched to Map. Falls back to navigating only if
                  // the point somehow isn't among the rows on screen.
                  const row = visibleRows.find((r) => rowId(r) === pointId || (r.kind === 'expense' && r.expense.id === pointId));
                  if (row) {
                    setDialogInitialEditing(false);
                    setSelectedRowId(rowId(row));
                  } else {
                    router.push(`/expense/${pointId}`);
                  }
                }}
                style={styles.map}
              />
            </View>
          ) : (
            <TransactionTable
              rows={visibleRows}
              isLoading={expensesLoading || incomesLoading}
              selectedRowId={selectedRowId}
              onSelectRow={onSelectRow}
              baseCurrency={baseCurrency}
              canEdit={canEdit}
              selectedIds={multiSelect.selectedIds}
              onToggleRow={multiSelect.toggleSelection}
              onSelectIds={multiSelect.selectIds}
              onClearSelection={multiSelect.exitMultiSelect}
              onOpenRowMenu={openMenu}
            />
          )}
          </View>
        </View>
      </ScrollView>

      {selectedRow && (
        <ExpenseDialog
          row={selectedRow}
          onClose={closeDialog}
          canEdit={canEdit}
          isTripAccount={isTripAccount}
          tripMembers={tripMembers}
          initialEditing={dialogInitialEditing}
        />
      )}

      {createKind && <CreateDialog kind={createKind} onClose={() => setCreateKind(null)} />}

      {menuState && (
        <RowContextMenu
          anchor={menuState.anchor}
          canEdit={canEdit}
          onClose={closeMenu}
          onEdit={() => {
            // Does NOT call `handleEdit` (fix round 1) — that navigates to
            // `/expense/[id]`, the exact screen decision 4 replaced with this
            // dialog. Selects the row and opens the SAME `ExpenseDialog` a
            // plain click would, straight into edit mode, so this row has
            // exactly one "open this" destination regardless of entry point.
            const row = menuState.row;
            closeMenu();
            setSelectedRowId(rowId(row));
            setDialogInitialEditing(true);
          }}
          onDuplicate={() => {
            closeMenu();
            handleDuplicate();
          }}
          onDelete={() => {
            closeMenu();
            handleDeleteFromList();
          }}
        />
      )}

      {/* Bulk category picker — reuses `multiSelect.handleBulkSetCategory`
          verbatim (the same list `ExpensesMobile.tsx` renders inline); only
          the surrounding chrome is desktop's own, a centered panel mirroring
          `ExpenseDialog.tsx`'s scrim, rather than mobile's edge-to-edge
          bottom sheet stretched across a wide viewport. */}
      {multiSelect.showBulkCategoryPicker && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => multiSelect.setShowBulkCategoryPicker(false)}
        >
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) multiSelect.setShowBulkCategoryPicker(false);
            }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.overlay,
              padding: 24,
            }}
          >
            <View style={styles.pickerPanel}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{t('expenses.bulkSetCategory')}</Text>
                <Pressable
                  onPress={() => multiSelect.setShowBulkCategoryPicker(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.pickerCancel}>{t('common.cancel')}</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.pickerList}>
                {categories
                  .filter((c) => !c.isDeleted)
                  .map((cat) => (
                    <Pressable
                      key={cat.id}
                      style={styles.pickerRow}
                      onPress={() => multiSelect.handleBulkSetCategory(cat.id)}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={(cat.icon as any) || 'pricetag-outline'}
                        size={18}
                        color={theme.colors.primary}
                      />
                      <Text style={styles.pickerRowText}>{cat.name}</Text>
                    </Pressable>
                  ))}
                {categories.filter((c) => !c.isDeleted).length === 0 && (
                  <Text style={styles.pickerEmpty}>{t('expenses.categoryAll')}</Text>
                )}
              </ScrollView>
            </View>
          </div>
        </Modal>
      )}

      {/* Bulk tag picker — hosts the SAME `BulkTagPickerSheet` mobile's
          bottom sheet already uses; only its wrapper differs. */}
      {multiSelect.showBulkTagPicker && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => multiSelect.setShowBulkTagPicker(false)}
        >
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) multiSelect.setShowBulkTagPicker(false);
            }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.overlay,
              padding: 24,
            }}
          >
            <View style={styles.pickerPanel}>
              <BulkTagPickerSheet
                tags={allTags}
                onConfirm={multiSelect.handleBulkAddTags}
                onClose={() => multiSelect.setShowBulkTagPicker(false)}
              />
            </View>
          </div>
        </Modal>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    // Must paint its own ground. Without this the tree is transparent and
    // React Navigation's DefaultTheme background (rgb(242,242,242)) shows
    // through from the navigator above — light grey behind dark-theme text,
    // which made rows unreadable in dark mode. `ExpensesMobile`'s container
    // has always set this; the desktop root simply never did.
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  searchBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    flex: 1,
    maxWidth: 360,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  searchInput: {
    flex: 1,
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  topBarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  viewToggle: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: 3,
  },
  viewToggleButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  viewToggleButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  viewToggleText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  viewToggleTextActive: {
    color: theme.colors.textPrimary,
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
  },
  addButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  addIncomeButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    borderWidth: 1,
    borderColor: theme.colors.success,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
  },
  addIncomeButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.success,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
  },
  body: {
    flex: 1,
    flexDirection: 'row' as const,
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  mapBannerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  // Placement only. The box itself is `BulkActionBar`'s; the main column has no
  // horizontal padding of its own, so the bar indents itself to the gutter the
  // table below it uses.
  bulkBarPlacement: {
    marginHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  bulkBarButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  bulkBarButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  pickerPanel: {
    width: '90%' as const,
    maxWidth: 420,
    maxHeight: '80%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  pickerHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  pickerTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  pickerCancel: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
  },
  pickerList: {
    maxHeight: 360,
  },
  pickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  pickerRowText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  pickerEmpty: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
});
