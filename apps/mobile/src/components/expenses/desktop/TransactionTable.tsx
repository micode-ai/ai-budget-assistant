import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useCategoryStore } from '@/stores/categoryStore';
import { groupByDay, rangeBetween, rowId, type LedgerRow, type DayGroup } from '@/features/expenses/desktopTable';
import { computeHeaderCheckState } from '@/features/expenses/desktopSelection';
import { resolveNextFocusedRow } from '@/features/expenses/rowKeyboardNav';
import { useDesktopShortcut } from '@/hooks/useDesktopShortcuts';

const TABLE_MIN_WIDTH = 940;

/**
 * Reads the shift-key state off whatever event shape actually reaches us.
 * RNW's `Pressable` fires `onPress` from a real DOM `click` for a mouse
 * activation, in which case the event React hands us IS the browser's
 * `MouseEvent`-shaped `SyntheticEvent` — `shiftKey` sits at the top level,
 * exactly like the native event it wraps (verified by reading RNW's own
 * `Pressable`/`PressResponder` source, not assumed: its internal `onClick`
 * handler reads `event.altKey` directly off the same object it then passes
 * straight to `onPress`). Neither RN's core `GestureResponderEvent` type nor
 * `PressableProps` know about `shiftKey` at all (it's a web-only notion), so
 * this reads through an `any` rather than fighting the type — the same
 * workaround this file's `SortButton`/`ExpenseDialog.tsx`'s raw `<div>`
 * already use for web-only capabilities RN's cross-platform types don't
 * model. Falls back to `nativeEvent.shiftKey` and then `false` so a keyboard
 * (Enter-key) activation, which carries no shift state at all, never throws.
 */
function readShiftKey(event: unknown): boolean {
  const e = event as { shiftKey?: boolean; nativeEvent?: { shiftKey?: boolean } } | null | undefined;
  return Boolean(e?.shiftKey ?? e?.nativeEvent?.shiftKey ?? false);
}

function stopEventPropagation(event: unknown): void {
  (event as { stopPropagation?: () => void } | null | undefined)?.stopPropagation?.();
}

type SortKey = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

interface Props {
  rows: LedgerRow[];
  isLoading: boolean;
  selectedRowId: string | null;
  onSelectRow: (row: LedgerRow) => void;
  /** Fallback currency label for a day whose spend rows are (rare, but
   *  possible) mixed-currency — see `dominantCurrency` below. */
  baseCurrency: string;
  /** Gates the entire selection surface (checkbox column, header checkbox,
   *  row context menu / "⋯" button) — a viewer can already read every row via
   *  the detail dialog a plain click opens, and every write this surface
   *  leads to (bulk category/tags/delete, and Duplicate/Delete from the row
   *  menu) is blocked server-side for them anyway, so showing the controls
   *  would just be a dead end. Mirrors the codebase-wide `canEdit`-gating
   *  convention for write affordances (categories/merchants/tags/projects
   *  screens, `ExpenseListItem`'s own checkbox column on mobile, etc). */
  canEdit: boolean;
  /** Only expense ids are ever members of this set — the hook behind it
   *  (`useExpenseMultiSelect`) is typed `Expense[]` and everything behind it
   *  ends at `PATCH /expenses/bulk`; there is no income bulk endpoint. */
  selectedIds: Set<string>;
  /** `useExpenseMultiSelect`'s own `toggleSelection` — a plain click on a
   *  row's checkbox. */
  onToggleRow: (id: string) => void;
  /** `useExpenseMultiSelect`'s own additive `selectIds` — replaces the whole
   *  selection with exactly the given ids. Used for BOTH a shift-click range
   *  (computed here, from the currently rendered order) and the header
   *  checkbox's "select all visible" action (computed here too, from the
   *  same order) — never handed a caller-supplied list, so it can never
   *  select an id this table isn't currently showing. */
  onSelectIds: (ids: string[]) => void;
  /** `useExpenseMultiSelect`'s own `exitMultiSelect` — the header checkbox's
   *  "clear everything" action once every visible selectable row is already
   *  checked. */
  onClearSelection: () => void;
  /** Opens the row's context menu (right-click, or the keyboard-reachable
   *  "⋯" button) at the given viewport coordinates. The menu itself, and the
   *  Edit/Duplicate/Delete handlers behind it, are owned by `ExpensesDesktop`
   *  — this table only ever reports "open a menu for this row, here". */
  onOpenRowMenu: (row: LedgerRow, anchor: { x: number; y: number }) => void;
  /** `false` while `ExpensesDesktop` has a dialog or the row context menu
   *  open. The keyboard row cursor (`↑`/`↓`/`Enter`/`Space`, below) is
   *  disabled in that state — otherwise a background row could visibly move
   *  or get its checkbox toggled while a modal has the user's real
   *  attention, since this table stays mounted underneath an open dialog. */
  keyboardNavEnabled: boolean;
}

function rowDescription(r: LedgerRow): string | undefined {
  return r.kind === 'expense' ? r.expense.description : r.income.description;
}
function rowCategoryId(r: LedgerRow): string | undefined {
  return r.kind === 'expense' ? r.expense.categoryId : r.income.categoryId;
}
function rowAttribution(r: LedgerRow): string | null {
  const name = r.kind === 'expense' ? r.expense.createdByUserName : r.income.createdByUserName;
  return name || null;
}
/** Income positive, expense negative — matches the explicit-sign convention
 *  this table renders, so "sort by amount" agrees with what's on screen. */
function signedAmount(r: LedgerRow): number {
  return r.kind === 'income' ? r.income.amount : -r.expense.amount;
}

/**
 * `groupByDay`'s `expenseSubtotal` is a plain sum across whatever currencies
 * that day's spend rows happen to use (see `desktopTable.ts` — it has no
 * per-currency split, unlike `summarise()`). In the overwhelmingly common
 * case a day's expenses share one currency, so labelling the total with the
 * first spend row's currency is correct; a genuinely mixed-currency day is a
 * known, accepted imprecision inherited from that pure module, not something
 * this component invents its own conflicting arithmetic to work around.
 */
function dominantCurrency(group: DayGroup, fallback: string): string {
  for (const r of group.rows) {
    if (r.kind === 'expense' && !r.expense.isSplitReceivable) return r.expense.currencyCode;
  }
  return fallback;
}

function parseIsoDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDayHeading(day: string, locale: string): string {
  return formatDate(parseIsoDay(day), { weekday: 'long', month: 'long', day: 'numeric' }, locale);
}

/**
 * Day-grouped ledger: expense + income rows sharing one table (design
 * decision 8), grouped by calendar day with an expenses-only subtotal per
 * day. Sortable by date (which day leads) and by amount (order within a
 * day) — the two dimensions that make sense without breaking the grouping;
 * Description/Category/Added-by stay plain, non-interactive headers.
 */
export function TransactionTable({
  rows,
  isLoading,
  selectedRowId,
  onSelectRow,
  baseCurrency,
  canEdit,
  selectedIds,
  onToggleRow,
  onSelectIds,
  onClearSelection,
  onOpenRowMenu,
  keyboardNavEnabled,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const categories = useCategoryStore((s) => s.categories);
  const locale = getIntlLocale();

  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // The keyboard row cursor (Task: keyboard shortcuts) — independent of
  // `selectedRowId` (which row's dialog is open) and `hoveredId` (the mouse).
  // Set by `↑`/`↓` AND by a plain click, so pressing an arrow after clicking
  // a row (then closing its dialog) continues from where the user was
  // looking, not from the top of the table.
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  // Shared by the checkbox AND the "⋯" button: whichever of the two controls
  // in a row currently HAS keyboard focus, so both can reveal themselves the
  // same way a mouse hover already does. Without this, a control that only
  // ever appears on hover is invisible to a keyboard user tabbing onto it —
  // present in the DOM, tabbable, but with nothing to see once it's reached.
  const [focusedControlId, setFocusedControlId] = useState<string | null>(null);
  // Shift-click anchor (Step 2). A plain click always MOVES the anchor; a
  // shift-click never does, so repeated shift-clicks keep extending/shrinking
  // the same range until the next plain click starts a new one — the
  // standard Explorer/Finder/Sheets convention.
  const shiftAnchorRef = useRef<string | null>(null);

  const categoryById = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    for (const c of categories) map.set(c.id, { name: c.name, color: c.color });
    return map;
  }, [categories]);

  const dayGroups = useMemo(() => {
    const groups = groupByDay(rows);
    const dateOrdered = sortKey === 'date' && sortDir === 'asc' ? [...groups].reverse() : groups;
    if (sortKey !== 'amount') return dateOrdered;
    return dateOrdered.map((g) => ({
      ...g,
      rows: [...g.rows].sort((a, b) =>
        sortDir === 'asc' ? signedAmount(a) - signedAmount(b) : signedAmount(b) - signedAmount(a)
      ),
    }));
  }, [rows, sortKey, sortDir]);

  // The visible, SELECTABLE (expense-only) ids, in the exact order this
  // table currently draws them — day-grouped, then sorted by whichever
  // column is active. This is the id list `rangeBetween` (Task 1) must
  // receive: not the unfiltered store order, and not `rows` in its raw
  // pre-day-group order, or a shift-click could select a row the current
  // sort/grouping doesn't actually show between the two clicked rows.
  const visibleSelectableOrder = useMemo(
    () => dayGroups.flatMap((g) => g.rows).filter((r) => r.kind === 'expense').map(rowId),
    [dayGroups]
  );
  const hasSelection = selectedIds.size > 0;
  const headerState = useMemo(
    () => computeHeaderCheckState(visibleSelectableOrder, selectedIds),
    [visibleSelectableOrder, selectedIds]
  );

  // ALL rows (income + expense), in the same rendered order — the keyboard
  // cursor moves through everything on screen, not just the checkbox-
  // selectable subset `visibleSelectableOrder` covers.
  const flatRows = useMemo(() => dayGroups.flatMap((g) => g.rows), [dayGroups]);
  const visibleRowOrder = useMemo(() => flatRows.map(rowId), [flatRows]);
  const rowById = useMemo(() => {
    const map = new Map<string, LedgerRow>();
    for (const r of flatRows) map.set(rowId(r), r);
    return map;
  }, [flatRows]);

  // If the current cursor scrolled out of view (a facet/sort change), don't
  // keep pointing at a row that's no longer rendered — the very next arrow
  // press already falls back to first/last via `resolveNextFocusedRow`, but
  // clearing it here also stops the (now invisible) highlight from lingering
  // on a row this table isn't drawing.
  useEffect(() => {
    if (focusedRowId && !rowById.has(focusedRowId)) setFocusedRowId(null);
  }, [focusedRowId, rowById]);

  useDesktopShortcut(
    'arrowdown',
    () => setFocusedRowId((current) => resolveNextFocusedRow(visibleRowOrder, current, 1)),
    { enabled: keyboardNavEnabled, description: t('shortcuts.navigateRows') }
  );
  useDesktopShortcut(
    'arrowup',
    () => setFocusedRowId((current) => resolveNextFocusedRow(visibleRowOrder, current, -1)),
    { enabled: keyboardNavEnabled, description: t('shortcuts.navigateRows') }
  );
  useDesktopShortcut(
    'enter',
    () => {
      if (!focusedRowId) return;
      const row = rowById.get(focusedRowId);
      if (row) onSelectRow(row);
    },
    { enabled: keyboardNavEnabled, description: t('shortcuts.openRow') }
  );
  // Expense rows only — an income row has no checkbox at all (constraint 1:
  // everything behind bulk selection ends at `PATCH /expenses/bulk`), so
  // `Space` on a focused income row is silently a no-op rather than an error.
  useDesktopShortcut(
    'space',
    () => {
      if (!focusedRowId) return;
      const row = rowById.get(focusedRowId);
      if (!row || row.kind !== 'expense') return;
      handleCheckboxPress(focusedRowId, { shiftKey: false });
    },
    { enabled: keyboardNavEnabled && canEdit, description: canEdit ? t('shortcuts.toggleRow') : undefined }
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleHeaderToggle = () => {
    if (headerState === 'checked') {
      onClearSelection();
    } else {
      onSelectIds(visibleSelectableOrder);
    }
  };

  // Checkbox click (Step 2): a plain click moves the anchor and toggles just
  // this row; a shift-click extends the range from the last anchor. A range
  // that comes back empty (anchor no longer visible under the current sort/
  // facets — `rangeBetween`'s own contract) falls back to a plain toggle
  // rather than silently doing nothing.
  const handleCheckboxPress = (id: string, event: unknown) => {
    stopEventPropagation(event);
    if (readShiftKey(event) && shiftAnchorRef.current) {
      const ids = rangeBetween(shiftAnchorRef.current, id, visibleSelectableOrder);
      if (ids.length > 0) {
        onSelectIds(ids);
        return;
      }
    }
    shiftAnchorRef.current = id;
    onToggleRow(id);
  };

  // Right-click anywhere on the row: anchor the menu at the pointer.
  const handleRowContextMenu = (row: LedgerRow, event: unknown) => {
    const e = event as { preventDefault?: () => void; clientX?: number; clientY?: number } | null | undefined;
    e?.preventDefault?.();
    stopEventPropagation(event);
    onOpenRowMenu(row, { x: e?.clientX ?? 0, y: e?.clientY ?? 0 });
  };

  // The "⋯" button: anchor the menu under the button itself, not the pointer
  // — this is also how a keyboard (Enter-key) activation reaches the menu,
  // which carries no pointer position at all.
  const handleMenuButtonPress = (row: LedgerRow, event: unknown) => {
    stopEventPropagation(event);
    let anchor = { x: 0, y: 0 };
    try {
      const e = event as { currentTarget?: { getBoundingClientRect?: () => { left: number; bottom: number } } } | null | undefined;
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      if (rect) anchor = { x: rect.left, y: rect.bottom + 4 };
    } catch {
      // Never let anchor resolution crash a row click — `RowContextMenu`
      // clamps to the viewport regardless, so (0,0) still lands on-screen.
    }
    onOpenRowMenu(row, anchor);
  };

  if (isLoading && rows.length === 0) {
    return (
      <View style={styles.emptyState}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{t('expensesDesktop.emptyState')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* A plain View, not a horizontal ScrollView. Two reasons, and the first
          is the load-bearing one: a horizontal scroller is a CSS scroll
          container on BOTH axes, so `position: sticky` on the header row would
          anchor to it instead of to the page scroll and never stick. Second,
          it has nothing left to do here — the facet rail collapses below
          1440, so the table always has at least the full 1024 of a desktop
          window against its 940 minimum, and the horizontal case it existed
          for is unreachable. */}
      <View style={styles.horizontalContent}>
          <View style={styles.table}>
            <View style={styles.headerRow}>
              {canEdit && (
                <View style={[styles.cellCheckbox, styles.alignCenter]}>
                  <HeaderCheckbox
                    state={headerState}
                    onPress={handleHeaderToggle}
                    theme={theme}
                    accessibilityLabel={t(
                      headerState === 'checked' ? 'expensesDesktop.clearSelection' : 'expensesDesktop.selectAllRows'
                    )}
                  />
                </View>
              )}
              <View style={styles.cellDate}>
                <SortButton
                  label={t('expensesDesktop.colDate')}
                  active={sortKey === 'date'}
                  direction={sortDir}
                  onPress={() => toggleSort('date')}
                  theme={theme}
                />
              </View>
              <View style={styles.cellDescription}>
                <Text style={styles.headerText}>{t('expensesDesktop.colDescription')}</Text>
              </View>
              <View style={styles.cellCategory}>
                <Text style={styles.headerText}>{t('expensesDesktop.colCategory')}</Text>
              </View>
              <View style={styles.cellAccount}>
                <Text style={styles.headerText}>{t('expensesDesktop.colAccount')}</Text>
              </View>
              <View style={[styles.cellAmount, styles.alignEnd]}>
                <SortButton
                  label={t('expensesDesktop.colAmount')}
                  active={sortKey === 'amount'}
                  direction={sortDir}
                  onPress={() => toggleSort('amount')}
                  theme={theme}
                  align="right"
                />
              </View>
              {canEdit && <View style={styles.cellMenu} />}
            </View>

            {dayGroups.map((group) => {
              const currency = dominantCurrency(group, baseCurrency);
              return (
                <View key={group.day}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayLabel}>{formatDayHeading(group.day, locale)}</Text>
                    <Text style={[styles.daySubtotal, { fontVariant: ['tabular-nums'] }]}>
                      {group.expenseSubtotal > 0 ? `-${formatCurrency(group.expenseSubtotal, currency)}` : '—'}
                    </Text>
                  </View>
                  {group.rows.map((row) => {
                    const id = rowId(row);
                    const isIncome = row.kind === 'income';
                    const description = rowDescription(row) || t(isIncome ? 'nav.income' : 'dashboard.expense');
                    const merchant = row.kind === 'expense' ? row.expense.merchant : undefined;
                    const categoryId = rowCategoryId(row);
                    const category = categoryId ? categoryById.get(categoryId) : undefined;
                    const attribution = rowAttribution(row);
                    const amount = row.kind === 'income' ? row.income.amount : row.expense.amount;
                    const currencyCode = row.kind === 'income' ? row.income.currencyCode : row.expense.currencyCode;
                    const hovered = hoveredId === id;
                    const selected = selectedRowId === id;
                    // Shared by the checkbox and the "⋯" button: visible on
                    // row hover, on either control's own focus, and — for the
                    // checkbox only, via `hasSelection` below — once ANY row
                    // is selected, so the user can see the full picture of
                    // what's checked, not just the row under the pointer.
                    const revealed = hovered || focusedControlId === id;
                    const checked = row.kind === 'expense' && selectedIds.has(id);
                    // `↑`/`↓`'s current position — a separate visual from
                    // `selected` (whose dialog is open) and `hovered` (the
                    // mouse), so all three can be told apart on screen at
                    // once.
                    const keyboardFocused = keyboardNavEnabled && focusedRowId === id;

                    return (
                      <Pressable
                        key={id}
                        onPress={() => {
                          // A plain click also moves the keyboard cursor here,
                          // so an `↑`/`↓` press after closing this row's
                          // dialog continues from where the user was looking
                          // rather than resetting to the top of the table.
                          setFocusedRowId(id);
                          onSelectRow(row);
                        }}
                        onHoverIn={() => setHoveredId(id)}
                        onHoverOut={() => setHoveredId((current) => (current === id ? null : current))}
                        accessibilityRole="button"
                        style={[
                          styles.row,
                          hovered && styles.rowHovered,
                          selected && styles.rowSelected,
                          keyboardFocused && styles.rowKeyboardFocused,
                        ]}
                        {...(canEdit
                          ? ({ onContextMenu: (e: unknown) => handleRowContextMenu(row, e) } as object)
                          : {})}
                      >
                        {canEdit && (
                          <View style={[styles.cellCheckbox, styles.alignCenter]}>
                            {row.kind === 'expense' && (
                              <RowCheckbox
                                checked={checked}
                                visible={revealed || hasSelection}
                                onPress={(e) => handleCheckboxPress(id, e)}
                                onFocus={() => setFocusedControlId(id)}
                                onBlur={() => setFocusedControlId((cur) => (cur === id ? null : cur))}
                                theme={theme}
                                accessibilityLabel={t('expensesDesktop.selectRow')}
                              />
                            )}
                          </View>
                        )}
                        {/* Deliberately empty, not a value that failed to
                            render: the day-group header above already carries
                            this row's date (same column, same paddingHorizontal),
                            and `Expense.time` has no usages anywhere in the
                            mobile UI to put here instead. This cell is
                            indentation under the group's date. */}
                        <View style={styles.cellDate} />
                        <View style={styles.cellDescription}>
                          <Text style={styles.descriptionText} numberOfLines={1}>
                            {description}
                          </Text>
                          {merchant ? (
                            <Text style={styles.merchantText} numberOfLines={1}>
                              {merchant}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.cellCategory}>
                          {category ? (
                            <View style={styles.categoryRow}>
                              <View
                                style={[
                                  styles.categoryDot,
                                  { backgroundColor: category.color || theme.colors.textDisabled },
                                ]}
                              />
                              <Text style={styles.cellText} numberOfLines={1}>
                                {category.name}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.cellTextMuted} numberOfLines={1}>
                              {t('common.uncategorized')}
                            </Text>
                          )}
                        </View>
                        <View style={styles.cellAccount}>
                          <Text style={styles.cellText} numberOfLines={1}>
                            {attribution || '—'}
                          </Text>
                        </View>
                        <View style={[styles.cellAmount, styles.alignEnd]}>
                          <Text
                            style={[
                              styles.amountText,
                              { fontVariant: ['tabular-nums'] },
                              { color: isIncome ? theme.colors.success : theme.colors.textPrimary },
                            ]}
                          >
                            {isIncome ? '+' : '-'}
                            {formatCurrency(amount, currencyCode)}
                          </Text>
                        </View>
                        {canEdit && (
                          <View style={[styles.cellMenu, styles.alignCenter]}>
                            <RowMenuButton
                              visible={revealed}
                              onPress={(e) => handleMenuButtonPress(row, e)}
                              onFocus={() => setFocusedControlId(id)}
                              onBlur={() => setFocusedControlId((cur) => (cur === id ? null : cur))}
                              theme={theme}
                              accessibilityLabel={t('expensesDesktop.rowActions')}
                            />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
      </View>
    </View>
  );
}

/**
 * A real `<button>`, not a `Pressable` styled to look like one — this table
 * is only ever reached through the web platform split (`ExpensesView.web.tsx`
 * -> `ExpensesDesktop` -> here), so it never ships to native, and a genuine
 * button gives keyboard users real semantics plus a focus ring we control
 * explicitly rather than trusting react-native-web's ARIA emulation.
 */
function SortButton({
  label,
  active,
  direction,
  onPress,
  theme,
  align = 'left',
}: {
  label: string;
  active: boolean;
  direction: SortDir;
  onPress: () => void;
  theme: Theme;
  align?: 'left' | 'right';
}) {
  const [focused, setFocused] = useState(false);
  return (
    <button
      type="button"
      onClick={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: 'flex',
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 'none',
        margin: 0,
        padding: '2px 4px',
        font: 'inherit',
        fontWeight: 600,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: active ? theme.colors.primary : theme.colors.textSecondary,
        cursor: 'pointer',
        borderRadius: 4,
        outline: focused ? `2px solid ${theme.colors.primary}` : 'none',
        outlineOffset: 2,
      }}
    >
      <span>{label}</span>
      {active ? <span aria-hidden="true" style={{ fontSize: 10 }}>{direction === 'asc' ? '▲' : '▼'}</span> : null}
    </button>
  );
}

/** Shared 16x16 square box both checkboxes render inside — mirrors
 *  `FacetRail.tsx`'s own `CheckboxRow` exactly (same dimensions, same
 *  border/fill convention), so a desktop table checkbox reads as the same
 *  control as the one already shipped beside it in the facet rail. */
function checkboxBoxStyle(theme: Theme, active: boolean) {
  return {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderColor: active ? theme.colors.primary : theme.colors.border,
    backgroundColor: active ? theme.colors.primary : theme.colors.surface,
  };
}

/**
 * A row's own checkbox (Step 1/2). Hidden (opacity 0, not unmounted — see
 * the file-level `focusedControlId` note) until the row is hovered, this
 * control (or another in the same row) has focus, or the table already has
 * a selection in progress; a `Pressable`, not a raw `<input type="checkbox">`,
 * to match this app's own themed checkbox look (`FacetRail.tsx`) rather than
 * the browser's native control chrome.
 */
function RowCheckbox({
  checked,
  visible,
  onPress,
  onFocus,
  onBlur,
  theme,
  accessibilityLabel,
}: {
  checked: boolean;
  visible: boolean;
  onPress: (event: unknown) => void;
  onFocus: () => void;
  onBlur: () => void;
  theme: Theme;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: visible ? 1 : 0, padding: 4 }}
    >
      <View style={checkboxBoxStyle(theme, checked)}>
        {checked && <Ionicons name="checkmark" size={12} color={theme.colors.textInverse} />}
      </View>
    </Pressable>
  );
}

/**
 * The header checkbox (Step 1) — tri-state, and ALWAYS visible (unlike the
 * per-row checkboxes): it's a structural part of the table header, not a
 * hover-revealed row affordance, so hiding it at rest would just make users
 * hunt for it. `state === 'indeterminate'` renders a dash rather than a
 * checkmark, and reports `accessibilityState.checked: 'mixed'` — so it never
 * claims to have selected every visible row when it's only selected some.
 */
function HeaderCheckbox({
  state,
  onPress,
  theme,
  accessibilityLabel,
}: {
  state: 'checked' | 'unchecked' | 'indeterminate';
  onPress: () => void;
  theme: Theme;
  accessibilityLabel: string;
}) {
  const checked = state === 'checked';
  const indeterminate = state === 'indeterminate';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked }}
      accessibilityLabel={accessibilityLabel}
      style={{ padding: 4 }}
    >
      <View style={checkboxBoxStyle(theme, checked || indeterminate)}>
        {checked && <Ionicons name="checkmark" size={12} color={theme.colors.textInverse} />}
        {indeterminate && <Ionicons name="remove" size={12} color={theme.colors.textInverse} />}
      </View>
    </Pressable>
  );
}

/**
 * The row's "⋯" button (Step 3) — the keyboard-reachable equivalent of a
 * right-click, per the task brief ("a right-click-only affordance is
 * unreachable by keyboard"). Same hover/focus-reveal treatment as the
 * checkbox (see `focusedControlId`): it stays IN the tab order and clickable
 * at all times, only its opacity is gated, so a keyboard user tabbing onto
 * it reveals it the instant it receives focus rather than finding nothing to
 * activate.
 */
function RowMenuButton({
  visible,
  onPress,
  onFocus,
  onBlur,
  theme,
  accessibilityLabel,
}: {
  visible: boolean;
  onPress: (event: unknown) => void;
  onFocus: () => void;
  onBlur: () => void;
  theme: Theme;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: visible ? 1 : 0, padding: 4, borderRadius: 4 }}
    >
      <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
  },
  verticalScroll: {
    flex: 1,
  },
  verticalContent: {
    flexGrow: 1,
  },
  horizontalContent: {
    minWidth: TABLE_MIN_WIDTH,
    // Fill the pane when there is room to spare, instead of stopping at the
    // columns' natural width and leaving dead space to the right of the last
    // column. Below TABLE_MIN_WIDTH the minWidth wins and it scrolls instead.
    flexGrow: 1,
  },
  table: {
    minWidth: TABLE_MIN_WIDTH,
    flexGrow: 1,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[6],
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    // Sticks to the top of the ONE page scroll, so the column labels survive
    // a long ledger without reintroducing a second scroller. Needs its own
    // opaque background or the rows would show through it, and a zIndex or
    // the rows would paint over it. `position: 'sticky'` is web-only and this
    // component is only ever reached through ExpensesView.web.tsx.
    position: 'sticky' as unknown as 'absolute',
    top: 0,
    zIndex: 2,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dayHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
  },
  dayLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  daySubtotal: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    // Reserved at 3px/transparent on every row so the keyboard-focus ring
    // below never shifts row width by appearing/disappearing.
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowKeyboardFocused: {
    borderLeftColor: theme.colors.primary,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  cellCheckbox: {
    width: 36,
  },
  cellMenu: {
    width: 36,
  },
  alignCenter: {
    alignItems: 'center' as const,
  },
  cellDate: {
    width: 72,
  },
  cellDescription: {
    flex: 2,
    minWidth: 220,
    paddingRight: theme.spacing[2],
  },
  cellCategory: {
    flex: 1,
    minWidth: 150,
    paddingRight: theme.spacing[2],
  },
  cellAccount: {
    flex: 1,
    minWidth: 140,
    paddingRight: theme.spacing[2],
  },
  cellAmount: {
    width: 140,
  },
  alignEnd: {
    alignItems: 'flex-end' as const,
  },
  headerText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  descriptionText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  merchantText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  categoryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cellText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  cellTextMuted: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  amountText: {
    ...theme.textStyles.bodyLargeMedium,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[10],
  },
  emptyText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
});
