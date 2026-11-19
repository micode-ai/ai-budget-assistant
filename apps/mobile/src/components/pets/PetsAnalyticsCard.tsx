import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Pet, PetHistory } from '@budget/shared-types';
import { api } from '@/services/api';
import { topPetKinds } from '@/features/pets/petDisplay';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  /** The account's pets; the caller renders nothing when this is empty. */
  pets: Pet[];
  /** `section` (phone): an h3 title above a card. `card` (desktop `BreakdownGrid` tile): the title inside. */
  variant: 'section' | 'card';
}

/**
 * The Analytics "Pets" entry (ABA-831): each pet with its cost over the last
 * 12 months, per month, and its two largest kinds. A figure still loading or
 * unavailable reads "—", never 0. Mirrors `VehiclesAnalyticsCard`. A row opens
 * the pet screen; the caption link opens Settings → Pets.
 */
export function PetsAnalyticsCard({ pets, variant }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const list = (
    <View style={styles.surface}>
      {variant === 'card' && <Text style={styles.cardTitle}>{t('pets.analyticsTitle')}</Text>}
      <View style={styles.captionRow}>
        <Text style={styles.caption}>{t('pets.last12Months')}</Text>
        <Pressable onPress={() => router.push('/settings/pets' as any)} accessibilityRole="link" hitSlop={8}>
          <Text style={styles.allLink}>{t('pets.manage')}</Text>
        </Pressable>
      </View>
      {pets.map((p, i) => (
        <PetRow key={p.id} pet={p} first={i === 0} />
      ))}
    </View>
  );
  if (variant === 'card') return list;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('pets.analyticsTitle')}</Text>
      {list}
    </View>
  );
}

function PetRow({ pet, first }: { pet: Pet; first: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [history, setHistory] = useState<PetHistory | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getPetHistory(pet.id, 12)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err) => {
        // Expected offline; never console.error (LogBox shows it as a crash).
        console.warn('Pet history unavailable', err);
      });
    return () => {
      cancelled = true;
    };
  }, [pet.id, pet.updatedAt]);

  const currency = history?.currencyCode ?? 'USD';
  const total = history ? formatCurrency(history.total, currency) : '—';
  const top = history
    ? topPetKinds(history.byKind)
        .map((k) => `${t(`pets.kind_${k.kind}`)} ${formatCurrency(k.amount, currency)}`)
        .join(' · ')
    : '';
  const sub =
    history && history.total > 0
      ? `${t('pets.perMonthShort', { amount: formatCurrency(history.perMonth, currency) })}${top ? ` · ${top}` : ''}`
      : history
        ? t('pets.noCostsYet')
        : '';

  return (
    <Pressable
      onPress={() => router.push(`/pets/${pet.id}` as any)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      accessibilityLabel={`${pet.name}, ${t('pets.last12Months')}: ${total}`}
      style={[styles.row, !first && styles.rowDivider, hovered && styles.rowHover]}
    >
      <Ionicons name="paw-outline" size={18} color={theme.colors.primary} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>
          {pet.name}
        </Text>
        {!!sub && (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <Text style={styles.rowAmount}>{total}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[5] },
  sectionTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  surface: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[1] },
  captionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  caption: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  allLink: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minHeight: 52,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  rowHover: { backgroundColor: theme.colors.surfaceSecondary },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  rowSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
});
