import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { LeafletMatch } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatLeafletPrice } from '@/features/leaflets/leafletDisplay';

/** Column widths shared with the desktop table header. */
export const LEAFLET_DESKTOP_COLUMNS = { promo: 110, usually: 190, condition: 150, action: 120 } as const;
const COL = LEAFLET_DESKTOP_COLUMNS;

export interface LeafletMatchRowProps {
  match: LeafletMatch;
  added: boolean;
  onAdd: (match: LeafletMatch) => Promise<void>;
  /** Desktop table row (fixed columns); the phone card is the default and unchanged by it. */
  desktop?: boolean;
}

/**
 * One leaflet offer for a product the user usually buys: name, the leaflet's price, "usually X → Y"
 * (only when a usual price exists — never a placeholder), the offer's condition, and Add to list.
 */
export function LeafletMatchRow({ match, added, onAdd, desktop = false }: LeafletMatchRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [busy, setBusy] = useState(false);

  const promo = formatLeafletPrice(match.promoPrice, match.currencyCode);
  const usually =
    match.usualPrice != null
      ? t('leaflets.usually', { usual: formatLeafletPrice(match.usualPrice, match.currencyCode), promo })
      : null;

  const press = async () => {
    if (busy || added) return;
    setBusy(true);
    try {
      await onAdd(match);
    } finally {
      setBusy(false);
    }
  };

  const button = (
    <Pressable
      onPress={press}
      disabled={added || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: added || busy }}
      accessibilityLabel={`${t(added ? 'leaflets.added' : 'leaflets.addToList')}: ${match.name}`}
      style={[styles.addButton, added && styles.addButtonDone]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <>
          <Ionicons
            name={added ? 'checkmark' : 'add'}
            size={16}
            color={added ? theme.colors.success : theme.colors.primary}
          />
          <Text style={[styles.addText, added && styles.addTextDone]}>
            {t(added ? 'leaflets.added' : 'leaflets.addToList')}
          </Text>
        </>
      )}
    </Pressable>
  );

  const condition = match.condition ? (
    <View style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {match.condition}
      </Text>
    </View>
  ) : null;

  if (desktop) {
    return (
      <View style={styles.dRow}>
        <View style={styles.dName}>
          <Text style={styles.name} numberOfLines={1}>
            {match.name}
          </Text>
        </View>
        <View style={styles.dPromo}>
          <Text style={styles.promo}>{promo}</Text>
        </View>
        <View style={styles.dUsually}>
          {usually && (
            <Text style={styles.usually} numberOfLines={1}>
              {usually}
            </Text>
          )}
        </View>
        <View style={styles.dCondition}>{condition}</View>
        <View style={styles.dAction}>{button}</View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {match.name}
        </Text>
        <View style={styles.priceLine}>
          <Text style={styles.promo}>{promo}</Text>
          {usually && <Text style={styles.usually}>{usually}</Text>}
        </View>
        {condition}
      </View>
      {button}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  name: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  priceLine: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'baseline' as const,
    columnGap: theme.spacing[2],
  },
  promo: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  usually: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    fontVariant: ['tabular-nums' as const],
  },
  chip: {
    alignSelf: 'flex-start' as const,
    maxWidth: '100%' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  chipText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    minHeight: 36,
    minWidth: 96,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  addButtonDone: {
    backgroundColor: theme.colors.successLight,
  },
  addText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  addTextDone: {
    color: theme.colors.success,
  },
  // Desktop table row: fixed columns so prices align down the ledger.
  dRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  dName: { flex: 1, minWidth: 140, paddingRight: theme.spacing[2] },
  dPromo: { width: COL.promo, alignItems: 'flex-end' as const, paddingRight: theme.spacing[3] },
  dUsually: { width: COL.usually, paddingRight: theme.spacing[2] },
  dCondition: { width: COL.condition, paddingRight: theme.spacing[2] },
  dAction: { width: COL.action, alignItems: 'flex-end' as const },
});
