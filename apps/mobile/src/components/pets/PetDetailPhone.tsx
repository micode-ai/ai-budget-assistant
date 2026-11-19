import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { PetDetailState } from '@/features/pets/usePetDetail';
import { filterPetItems, petKindRows } from '@/features/pets/petDisplay';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  PetDetailStatus,
  PetEncryptionNote,
  PetFxNotice,
  PetItemList,
  PetKindBreakdown,
  PetMonthBars,
  PetMonthFilterBar,
  PetPeriodChips,
  usePetTiles,
} from './PetDetailParts';

export interface PetDetailLayoutProps {
  /** From `usePetDetail`, called once in `PetDetailView` above the 1024 split. */
  detail: PetDetailState;
  canEdit: boolean;
  encryptionNote: 'none' | 'locked' | 'plain';
}

/**
 * The phone (and narrow web) pet screen (ABA-831): period chips, four tiles,
 * costs by month, by kind, then every cost. Presentational.
 */
export function PetDetailPhone({ detail, canEdit, encryptionNote }: PetDetailLayoutProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { pet, history } = detail;
  const tiles = usePetTiles(history);

  let body: React.ReactNode;
  if (detail.notFound) body = <PetDetailStatus kind="notFound" />;
  else if (detail.error && !history) body = <PetDetailStatus kind="error" onRetry={detail.retry} />;
  else if (!history || !pet) body = <PetDetailStatus kind="loading" />;
  else {
    const rows = petKindRows(history, detail.month);
    const items = filterPetItems(history.items, detail.month, detail.kind);
    body = (
      <>
        <View style={styles.heading}>
          <Ionicons name="paw-outline" size={22} color={theme.colors.primary} />
          <View style={styles.headingText}>
            <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
              {pet.name}
            </Text>
            <Text style={styles.sub}>{t(`pets.species_${pet.species}`)}</Text>
          </View>
        </View>

        <PetEncryptionNote note={encryptionNote} />

        <PetPeriodChips period={detail.period} onChange={detail.setPeriod} />

        <View style={[styles.tiles, detail.loading && styles.stale]}>
          {tiles.map((tile) => (
            <View key={tile.key} style={styles.tile}>
              <Text style={styles.tileLabel}>{tile.label}</Text>
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {tile.value}
              </Text>
            </View>
          ))}
        </View>

        {history.fxApproximate && <PetFxNotice />}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('pets.byMonth')}</Text>
          <PetMonthBars history={history} month={detail.month} onSelect={detail.setMonth} />
        </View>

        {detail.month && <PetMonthFilterBar month={detail.month} onClear={() => detail.setMonth(null)} />}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('pets.byKind')}</Text>
          <PetKindBreakdown rows={rows} currency={history.currencyCode} kind={detail.kind} onSelectKind={detail.setKind} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {detail.kind ? `${t('pets.itemsTitle')} · ${t(`pets.kind_${detail.kind}`)}` : t('pets.itemsTitle')}
          </Text>
          <PetItemList items={items} petName={pet.name} canEdit={canEdit} onRemove={detail.removeCost} />
        </View>
      </>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[8] + insets.bottom }]}
    >
      {body}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], gap: theme.spacing[4] },
  heading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  headingText: { flex: 1, minWidth: 0 },
  name: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  stale: { opacity: 0.6 },
  tile: {
    flexBasis: '45%' as const,
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[3],
    ...theme.shadows.sm,
  },
  tileLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[1] },
  tileValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
});
