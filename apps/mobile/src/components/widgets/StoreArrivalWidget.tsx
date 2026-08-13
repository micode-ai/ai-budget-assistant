import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { formatCurrency } from '@budget/shared-utils';
import type { SafeToSpendResponse } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useNearbyStore } from '@/hooks/useNearbyStore';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { useAccountStore } from '@/stores/accountStore';

const MAX_LIST_ITEMS = 5;

interface StoreArrivalWidgetProps {
  /**
   * Passed down from `useHomeScreenData`/`HomeWidgetContext` — NOT fetched by
   * this widget. `useSafeToSpend()` already fires `GET /insights/safe-to-spend`
   * once per home-screen visit for the hero header; calling it a second time
   * here doubled that request for every user, including the near-total
   * majority who are never standing in a known shop. Consume the already-
   * fetched value instead, the same way every other ctx-driven widget in
   * `HomeWidgetSwitch` does.
   */
  safeToSpendData: SafeToSpendResponse | null;
  hasSafeToSpend: boolean;
}

/**
 * Shown only while the user is standing in a shop they've bought from before
 * (Task 2's `useNearbyStore`). Deliberately only two things: what they came
 * for (the active shopping list's unchecked items) and what restrains them
 * (today's safe-to-spend figure). A third "you usually spend ~X here" line
 * was considered and cut during design — it is neither actionable nor
 * restraining. Do not add it back.
 *
 * This widget does not add a network call of its own for the common case —
 * `nearby === null` — but it is not call-free: while genuinely standing in a
 * known shop it self-hydrates the shopping-list store (see the effect below),
 * because nothing else on the home screen warms that store on a cold start.
 * That hydrate is gated on `nearby` so a user who never passes a known shop
 * pays nothing for it, mirroring `FamilyFeedWidget`'s own self-hydrate.
 */
export function StoreArrivalWidget({ safeToSpendData, hasSafeToSpend }: StoreArrivalWidgetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const nearby = useNearbyStore();
  const items = useShoppingListStore((s) => s.items);
  const hydrateShoppingList = useShoppingListStore((s) => s.hydrate);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  // Nothing else hydrates the shopping-list store on a cold start (its only
  // other call site is app/shopping-list/index.tsx's own mount effect), so
  // without this a user who opens the app while walking into the shop would
  // see the list block as correctly-omitted-but-empty even though a real list
  // exists. Gated on the boolean transition (not the `nearby` object itself,
  // which is a fresh reference on every re-check) so it fires once per
  // "became nearby" event, not on every GPS recheck while already inside.
  //
  // `currentAccountId` is a dependency for the same reason FamilyFeedWidget and
  // app/shopping-list/index.tsx carry it: nothing resets shoppingListStore on an
  // account switch. A couple who both shop at the same Biedronka would keep
  // `isNearby` true across the switch, so without this the card under the family
  // account would go on listing the personal account's items.
  const isNearby = nearby !== null;
  useEffect(() => {
    if (isNearby) {
      void hydrateShoppingList();
    }
  }, [isNearby, hydrateShoppingList, currentAccountId]);

  if (!nearby) return null; // not at a known shop — nothing at all, no empty card

  const unchecked = items.filter((i) => !i.isChecked);
  const visibleItems = unchecked.slice(0, MAX_LIST_ITEMS);
  const moreCount = unchecked.length - visibleItems.length;
  const showSpend = hasSafeToSpend && safeToSpendData !== null;

  // Both blocks below are conditional, so a user with location on, an empty
  // list and no safe-to-spend figure would otherwise get a title and a chevron
  // over nothing. A card with no content is worse than no card.
  if (!showSpend && unchecked.length === 0) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push('/shopping-list' as any)}
    >
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.titleRow}>
        <Ionicons name="storefront-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.title} numberOfLines={1}>
          {t('storeArrival.title', { merchant: nearby.merchant })}
        </Text>
      </View>

      {/* Omitted entirely (not an empty state) when the list has no unchecked items. */}
      {unchecked.length > 0 && (
        <View style={styles.listBlock}>
          <Text style={styles.listHeading}>{t('storeArrival.listHeading')}</Text>
          {visibleItems.map((item) => (
            <Text key={item.id} style={styles.listItem} numberOfLines={1}>
              {'•  '}
              {item.rawLabel}
            </Text>
          ))}
          {moreCount > 0 && (
            <Text style={styles.moreItems}>{t('storeArrival.moreItems', { count: moreCount })}</Text>
          )}
        </View>
      )}

      {showSpend && safeToSpendData && (
        <View style={styles.spendRow}>
          <Text style={styles.spendLabel}>{t('storeArrival.safeToSpend')}</Text>
          <Text style={styles.spendValue}>
            {formatCurrency(safeToSpendData.safeToSpendToday, safeToSpendData.baseCurrency)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  listBlock: {
    marginTop: theme.spacing[3],
  },
  listHeading: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  listItem: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  moreItems: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  spendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  spendLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  spendValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.primary,
  },
});
