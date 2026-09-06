import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAccountStore, getTripDaysLeft } from '@/stores/accountStore';
import { hydrateTransactions } from '@/stores/hydrateTransactions';
import { useCategoryStore } from '@/stores/categoryStore';
import { useWalletStore } from '@/stores/walletStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountType, Currency } from '@budget/shared-types';
import { SUPPORTED_CURRENCIES, getCurrencySymbol } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
import { TOP_BAR_HEIGHT } from '@/components/webLayout.constants';

/**
 * `WebTopBar`'s own `paddingHorizontal`. Duplicated as a named constant rather
 * than imported, because that value lives in a `StyleSheet.create` inside a
 * web-only file this shared component must not import — pulling `WebTopBar`
 * in here would put the whole desktop bar into the native graph, the exact
 * thing `WebShell.tsx`'s split exists to prevent. Keep the two in step.
 */
const WEB_TOP_BAR_PADDING_X = 20;

const ACCOUNT_TYPE_ICONS: Record<AccountType, keyof typeof Ionicons.glyphMap> = {
  personal: 'person-outline',
  business: 'briefcase-outline',
  shared: 'people-outline',
  investment: 'trending-up-outline',
  trip: 'briefcase-outline',
};

export function AccountSwitcher({
  compact = false,
  showCurrency = true,
  maxTriggerWidth,
  desktop = false,
}: {
  compact?: boolean;
  /** Hide the inline currency symbol when a separate CurrencyPill sits next to the switcher. */
  showCurrency?: boolean;
  /**
   * Override the trigger's width cap, for a caller whose bar has room to
   * spare.
   *
   * Optional and unset by default, so every existing call site — including
   * BOTH phone ones, the home hero and the tab header — renders exactly as
   * before. The caps themselves are unchanged: `compact` still means 110 and
   * the full trigger still means 140, because those exist for phone headers
   * where horizontal space is genuinely scarce.
   *
   * It exists because `WebTopBar` inherited `compact` for its type scale and
   * got the phone's width cap with it, truncating a perfectly ordinary
   * account name to "Investm…" on a bar with a `flex: 1` spacer and hundreds
   * of pixels going spare. Raising the shared cap would have changed the
   * phone; a caller-supplied override cannot.
   */
  maxTriggerWidth?: number;
  /**
   * Desktop web only: size and right-anchor the menu panel under `WebTopBar`,
   * and use a raw `<div>` scrim instead of a `Pressable`.
   *
   * Defaults to `false`, so BOTH phone call sites — the home hero and the tab
   * header — render byte-identically to before. The `desktop?: boolean`
   * defaulting to false is the design language's own convention for a
   * component both platforms render (`InflationIndexSection`): the mobile call
   * site passes nothing and therefore keeps its layout by construction rather
   * than by discipline.
   *
   * **The `<div>` below is unreachable from native, structurally.** Only
   * `WebTopBar` passes this prop, `WebTopBar` is imported only by
   * `WebShell.web.tsx`, and native's `WebShell.tsx` is a real no-op that
   * imports neither — so on a phone this branch is dead code that React Native
   * never evaluates, not a runtime `Platform` check that could be reached.
   */
  desktop?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [pastTripsExpanded, setPastTripsExpanded] = useState(false);
  const { t } = useTranslation();
  const { accounts, currentAccountId, switchAccount, ensureAccountsLoaded } = useAccountStore();
  const { loadCategories } = useCategoryStore();
  const { loadWallet } = useWalletStore();
  const { loadBudgets } = useBudgetStore();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const currentAccount = accounts.find((a) => a.id === currentAccountId);

  // Archived trips get their own collapsible section below the main list
  // (they're read-only — TripArchivedGuard blocks writes server-side — but
  // still switchable so members can review old spend).
  const visibleAccounts = accounts.filter((a) => a.tripStatus !== 'archived');
  const archivedTripAccounts = accounts.filter((a) => a.tripStatus === 'archived');

  const user = useAuthStore((s) => s.user);
  const setCurrency = useAuthStore((s) => s.setCurrency);
  const currencyCode = (user?.currencyCode || 'USD') as Currency;

  const handleSwitch = async (accountId: string) => {
    setVisible(false);
    if (accountId === currentAccountId) return;
    await switchAccount(accountId);
    // Reload all data for the new account. hydrateTransactions serializes
    // expenses→incomes to avoid SQLite contention; other stores run in parallel.
    await Promise.all([hydrateTransactions(), loadCategories(), loadWallet(), loadBudgets()]);
  };

  const handleTriggerPress = () => {
    // Always open the menu so the currency control is reachable even with a
    // single account. Account management is the "Manage accounts" button inside.
    setVisible(true);
    // On web the list is rebuilt from the server on every page load, so a
    // single failed `GET /accounts` leaves this menu empty for the rest of the
    // session — and this menu is the only place a user would go to fix that.
    // A no-op whenever the list is already there (i.e. always, on native).
    void ensureAccountsLoaded();
  };

  const renderAccountRow = (item: (typeof accounts)[number]) => {
    const isActive = item.id === currentAccountId;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.accountItem, isActive && styles.accountItemActive]}
        onPress={() => handleSwitch(item.id)}
      >
        <View style={styles.accountIcon}>
          <Ionicons
            name={ACCOUNT_TYPE_ICONS[item.type]}
            size={20}
            color={isActive ? theme.colors.primary : theme.colors.textSecondary}
          />
        </View>
        <View style={styles.accountInfo}>
          <View style={styles.accountNameRow}>
            {item.type === 'trip' && (
              <Ionicons
                name="briefcase-outline"
                size={13}
                color={theme.colors.textTertiary}
                style={styles.tripNameIcon}
              />
            )}
            <Text
              style={[styles.accountName, isActive && styles.accountNameActive]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>
          <Text style={styles.accountType}>{t(`accounts.types.${item.type}`)}</Text>
          {item.type === 'trip' && item.tripStatus === 'active' && (
            <TouchableOpacity
              onPress={() => {
                setVisible(false);
                router.push(`/trip/${item.id}/settle-up`);
              }}
            >
              <Text style={styles.tripBadge}>
                {t('trip.daysLeft', { count: getTripDaysLeft(item) ?? 0 })}
              </Text>
            </TouchableOpacity>
          )}
          {item.type === 'trip' && item.tripStatus === 'settling' && (
            <TouchableOpacity
              onPress={() => {
                setVisible(false);
                router.push(`/trip/${item.id}/settle-up`);
              }}
            >
              <Text style={[styles.tripBadge, styles.tripBadgeUrgent]}>{t('trip.tripEnded')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {isActive && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          compact && styles.triggerCompact,
          maxTriggerWidth !== undefined && { maxWidth: maxTriggerWidth },
        ]}
        onPress={handleTriggerPress}
      >
        <Ionicons
          name={ACCOUNT_TYPE_ICONS[currentAccount?.type || 'personal']}
          size={compact ? 14 : 18}
          color={theme.colors.textInverse}
        />
        <Text style={[styles.triggerText, compact && styles.triggerTextCompact]} numberOfLines={1}>
          {currentAccount?.name || t('accounts.personal')}
        </Text>
        {showCurrency && (
          <Text style={[styles.triggerCurrency, compact && styles.triggerCurrencyCompact]}>
            {` · ${getCurrencySymbol(currencyCode)}`}
          </Text>
        )}
        <Ionicons name="chevron-down" size={compact ? 12 : 16} color={theme.colors.textInverse} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <MenuScrim desktop={desktop} styles={styles} theme={theme} onDismiss={() => setVisible(false)}>
          <View style={[styles.dropdown, desktop && styles.dropdownDesktop]}>
            <Text style={styles.dropdownTitle}>{t('accounts.switchAccount')}</Text>

            <FlatList
              style={styles.accountList}
              data={visibleAccounts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => renderAccountRow(item)}
            />

            {archivedTripAccounts.length > 0 && (
              <View style={styles.pastTripsSection}>
                <TouchableOpacity
                  style={styles.pastTripsHeader}
                  onPress={() => setPastTripsExpanded((v) => !v)}
                >
                  <Text style={styles.pastTripsTitle}>{t('trip.pastTrips')}</Text>
                  <Ionicons
                    name={pastTripsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.colors.textTertiary}
                  />
                </TouchableOpacity>
                {pastTripsExpanded && (
                  <FlatList
                    style={styles.pastTripsList}
                    data={archivedTripAccounts}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => renderAccountRow(item)}
                  />
                )}
              </View>
            )}

            <View style={styles.currencySection}>
              <Text style={styles.currencyTitle}>{t('accounts.displayCurrency')}</Text>
              <View style={styles.currencyChips}>
                {SUPPORTED_CURRENCIES.map((c) => {
                  const active = c.code === currencyCode;
                  return (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.currencyChip, active && styles.currencyChipActive]}
                      onPress={() => {
                        setVisible(false);
                        setCurrency(c.code);
                      }}
                    >
                      <Text
                        style={[
                          styles.currencyChipText,
                          active && styles.currencyChipTextActive,
                        ]}
                      >
                        {c.code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => {
                setVisible(false);
                router.push('/account/list');
              }}
            >
              <Ionicons name="settings-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.manageButtonText}>{t('accounts.manage')}</Text>
            </TouchableOpacity>
          </View>
        </MenuScrim>
      </Modal>
    </>
  );
}

/**
 * The dismiss-on-click backdrop behind either menu.
 *
 * **On desktop it is a raw `<div>`, never a `Pressable`.** react-native-web
 * gives every `Pressable` a `tabIndex` attribute, and ANY tabindex — including
 * `-1` — makes an element a valid `.focus()` target, which is all RN's
 * `ModalFocusTrap` checks for when it walks for the first focusable
 * descendant. So a `Pressable` scrim is the trap's FIRST target and swallows
 * the focus that should land on a real control inside the panel. The design
 * language names this exactly and `ExpenseDialog` already solves it the same
 * way. A bare `<div>` with no tabindex is genuinely unfocusable, so the walk
 * skips it and recurses into the panel.
 *
 * The CSS mirrors `styles.overlay` axis for axis: RN's overlay is a column
 * flex container, so its `justifyContent` is the VERTICAL axis (top) and its
 * `alignItems` is the HORIZONTAL one (right) — hence `flexDirection: 'column'`
 * here rather than relying on the CSS default of `row`, which would silently
 * swap the two.
 *
 * Off desktop it is the exact `Pressable` that shipped, so the phone is
 * unchanged.
 */
function MenuScrim({
  desktop,
  styles,
  theme,
  onDismiss,
  children,
}: {
  desktop: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  if (!desktop) {
    return (
      <Pressable style={styles.overlay} onPress={onDismiss}>
        {children}
      </Pressable>
    );
  }
  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        // Clears the bar rather than the magic `60` the mobile overlay uses.
        paddingTop: TOP_BAR_HEIGHT + 4,
        // Equal to `WebTopBar`'s own `paddingHorizontal`, so the panel's right
        // edge lines up with the trigger that opened it. A known constant, so
        // no measurement and no positioning math.
        paddingRight: WEB_TOP_BAR_PADDING_X,
        backgroundColor: theme.colors.overlay,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Standalone display-currency pill for the home hero header. Opens the same
 * currency chips the AccountSwitcher menu offers; changes route through
 * authStore.setCurrency (single source of the optimistic/persist logic).
 * Currency is a user preference, not account-scoped — no canEdit gate.
 */
export function CurrencyPill({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const user = useAuthStore((s) => s.user);
  const setCurrency = useAuthStore((s) => s.setCurrency);
  const currencyCode = (user?.currencyCode || 'USD') as Currency;

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, compact && styles.triggerCompact, styles.currencyPillTrigger]}
        onPress={() => setVisible(true)}
      >
        <Text style={[styles.triggerCurrency, compact && styles.triggerCurrencyCompact]}>
          {getCurrencySymbol(currencyCode)}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 12 : 16} color={theme.colors.textInverse} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>{t('accounts.displayCurrency')}</Text>
            <View style={styles.currencyPillChips}>
              {SUPPORTED_CURRENCIES.map((c) => {
                const active = c.code === currencyCode;
                return (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.currencyChip, active && styles.currencyChipActive]}
                    onPress={() => {
                      setVisible(false);
                      setCurrency(c.code);
                    }}
                  >
                    <Text
                      style={[
                        styles.currencyChipText,
                        active && styles.currencyChipTextActive,
                      ]}
                    >
                      {c.code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  trigger: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginLeft: theme.spacing[4],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    backgroundColor: 'rgba(255,255,255,0.2)' as const,
    borderRadius: theme.borderRadius.xl,
    maxWidth: 140,
    gap: theme.spacing[1],
  },
  triggerCompact: {
    marginLeft: 0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    maxWidth: 110,
  },
  triggerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
    flexShrink: 1,
  },
  triggerTextCompact: {
    fontSize: 12,
  },
  triggerCurrency: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
    fontWeight: '700' as const,
    flexShrink: 0,
  },
  triggerCurrencyCompact: {
    fontSize: 12,
  },
  currencyPillTrigger: {
    marginLeft: theme.spacing[2],
    maxWidth: undefined,
  },
  currencyPillChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[2],
  },
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-start' as const,
    paddingTop: 60,
  },
  // Desktop: a real width, replacing the horizontal margins. The full-width
  // band this fixes had a one-line cause — `dropdown` set `marginHorizontal`
  // and NO `width` and NO `maxWidth`, inside an overlay with
  // `justifyContent: 'flex-start'`, so the panel stretched to the viewport
  // minus 40px: an 1880px panel at 1920. It was never sized, only inset.
  // `maxHeight: '82%'` below already handles seven accounts, so the list needs
  // nothing.
  dropdownDesktop: {
    width: 340,
    marginHorizontal: 0,
  },
  dropdown: {
    marginHorizontal: theme.spacing[5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[4],
    maxHeight: '82%' as const,
    ...theme.shadows.lg,
  },
  dropdownTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing[5],
    marginBottom: theme.spacing[3],
  },
  accountItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
  },
  accountItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  accountIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[3],
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  accountNameActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  accountType: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  accountNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  tripNameIcon: {
    marginRight: theme.spacing[1],
  },
  tripBadge: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  tripBadgeUrgent: {
    color: theme.colors.danger,
    fontWeight: '600' as const,
  },
  pastTripsSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  pastTripsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
  },
  pastTripsTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
  },
  pastTripsList: {
    maxHeight: 140,
  },
  manageButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    marginTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    gap: theme.spacing[1.5],
  },
  manageButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  accountList: {
    maxHeight: 340,
  },
  currencySection: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    marginTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  currencyTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[2],
  },
  currencyChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  currencyChip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  currencyChipActive: {
    backgroundColor: theme.colors.primary,
  },
  currencyChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyChipTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '700' as const,
  },
});
