import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SummaryTile } from '@/components/analytics/desktop/SummaryTile';
import { FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
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
} from '../PetDetailParts';
import type { PetDetailLayoutProps } from '../PetDetailPhone';

/** The rail's width beside the focus column (the dashboard pattern). */
const RAIL_WIDTH = 320;

/**
 * The pet screen at >= 1024 (ABA-831), in the vehicle screen's shape: a "Pets"
 * breadcrumb, the name with the period chips, four tiles, then a focus column
 * (costs by month, every cost) beside a rail with the breakdown by kind. Below
 * 1440 the rail drops under the focus column. One page scroll.
 * Presentational: `detail` comes from `PetDetailView`.
 */
export function PetDetailDesktop({ detail, canEdit, encryptionNote }: PetDetailLayoutProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const sideBySide = width >= FACET_RAIL_MIN_WIDTH;
  const { pet, history } = detail;
  const tiles = usePetTiles(history);

  if (detail.notFound || (detail.error && !history) || !history || !pet) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
        <Breadcrumb />
        <PetDetailStatus kind={detail.notFound ? 'notFound' : detail.error ? 'error' : 'loading'} onRetry={detail.retry} />
      </ScrollView>
    );
  }

  const rows = petKindRows(history, detail.month);
  const items = filterPetItems(history.items, detail.month, detail.kind);

  const breakdown = (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('pets.byKind')}</Text>
      <PetKindBreakdown rows={rows} currency={history.currencyCode} kind={detail.kind} onSelectKind={detail.setKind} />
    </View>
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
      <Breadcrumb />
      <View style={styles.headerRow}>
        <View style={styles.heading}>
          <Ionicons name="paw-outline" size={26} color={theme.colors.primary} />
          <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
            {pet.name}
          </Text>
          <Text style={styles.sub}>{t(`pets.species_${pet.species}`)}</Text>
        </View>
        <PetPeriodChips period={detail.period} onChange={detail.setPeriod} />
      </View>

      <PetEncryptionNote note={encryptionNote} />

      <View style={[styles.tiles, detail.loading && styles.stale]}>
        {tiles.map((tile) => (
          <SummaryTile key={tile.key} label={tile.label}>
            <Text style={styles.tileValue}>{tile.value}</Text>
          </SummaryTile>
        ))}
      </View>

      {history.fxApproximate && <PetFxNotice />}

      <View style={[styles.columns, !sideBySide && styles.columnsStacked]}>
        <View style={styles.focus}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('pets.byMonth')}</Text>
            <PetMonthBars history={history} month={detail.month} onSelect={detail.setMonth} />
          </View>
          {detail.month && <PetMonthFilterBar month={detail.month} onClear={() => detail.setMonth(null)} />}
          {!sideBySide && breakdown}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {detail.kind ? `${t('pets.itemsTitle')} · ${t(`pets.kind_${detail.kind}`)}` : t('pets.itemsTitle')}
            </Text>
            <PetItemList items={items} petName={pet.name} canEdit={canEdit} onRemove={detail.removeCost} />
          </View>
        </View>
        {sideBySide && <View style={styles.rail}>{breakdown}</View>}
      </View>
    </ScrollView>
  );
}

function Breadcrumb() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={() => router.push('/settings/pets' as any)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
      style={styles.breadcrumb}
    >
      <Text style={[styles.breadcrumbText, hovered && styles.breadcrumbHover]}>{t('pets.title')}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  page: { padding: theme.spacing[6], gap: theme.spacing[4] },
  breadcrumb: { alignSelf: 'flex-start' as const },
  breadcrumbText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textLink },
  breadcrumbHover: { textDecorationLine: 'underline' as const },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  heading: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: theme.spacing[2], flexShrink: 1 },
  name: { ...theme.textStyles.h2, color: theme.colors.textPrimary, flexShrink: 1 },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  tiles: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[4] },
  stale: { opacity: 0.6 },
  tileValue: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  columns: { flexDirection: 'row' as const, gap: theme.spacing[4], alignItems: 'flex-start' as const },
  columnsStacked: { flexDirection: 'column' as const, alignItems: 'stretch' as const },
  focus: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: theme.spacing[4] },
  rail: { width: RAIL_WIDTH, flexShrink: 0 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.sm,
  },
  cardTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
});
