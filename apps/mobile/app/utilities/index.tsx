import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { UtilityKindStats, UtilitySummary, UtilityUnit } from '@budget/shared-types';
import { api } from '@/services/api';
import { useTheme, useStyles, type Theme } from '@/theme';

const UNIT_LABEL: Record<UtilityUnit, string> = { kwh: 'kWh', m3: 'm³', gj: 'GJ' };

/**
 * Utilities (docs/contracts/utility-bill-readings.md): per kind, the unit price and consumption by
 * month, a year-over-year line once 12+ months exist and a nudge when the price jumped. Bars are
 * plain Views, no chart library. The header is registered in `app/_layout.tsx`.
 */
export default function UtilitiesScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [summary, setSummary] = useState<UtilitySummary | null>(null);
  const [property, setProperty] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setSummary(await api.getUtilitySummary(property));
    } catch {
      setFailed(true);
    }
  }, [property]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('utilities.loadFailed')}</Text>
      </View>
    );
  }
  if (!summary) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const money = (n: number) => formatCurrency(n, summary.currencyCode);
  const pctText = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n}%`);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {summary.properties.length > 0 && (
        <View style={styles.chips}>
          {[undefined, ...summary.properties].map((p) => (
            <Pressable
              key={p ?? 'all'}
              onPress={() => setProperty(p)}
              style={[styles.chip, property === p && styles.chipActive]}
            >
              <Text style={[styles.chipText, property === p && styles.chipTextActive]}>
                {p ?? t('utilities.allProperties')}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {summary.kinds.length === 0 && <Text style={styles.muted}>{t('utilities.empty')}</Text>}
      {summary.kinds.map((k) => (
        <KindCard key={k.kind} stats={k} money={money} pctText={pctText} />
      ))}
      {summary.fxApproximate && <Text style={styles.muted}>{t('utilities.fxApproximate')}</Text>}
    </ScrollView>
  );
}

function KindCard({
  stats,
  money,
  pctText,
}: {
  stats: UtilityKindStats;
  money: (n: number) => string;
  pctText: (n: number | null) => string;
}) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const unit = UNIT_LABEL[stats.unit];
  const recent = stats.months.slice(-12);
  const maxPrice = Math.max(...recent.map((m) => m.unitPrice ?? 0), 0.0001);
  const kindLabel = t(`utilities.kinds.${stats.kind}`);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{kindLabel}</Text>
      {stats.priceNudge && (
        <Text style={styles.nudge}>
          {t('utilities.nudge', { kind: kindLabel, pct: stats.priceNudge.risePct })}
        </Text>
      )}
      {stats.yearOverYear && (
        <Text style={styles.muted}>
          {t('utilities.yoy', {
            price: pctText(stats.yearOverYear.unitPriceChangePct),
            use: pctText(stats.yearOverYear.consumptionChangePct),
          })}
        </Text>
      )}
      <Text style={styles.sectionLabel}>{`${t('utilities.unitPrice')} / ${unit}`}</Text>
      {recent.map((m) => (
        <View key={m.month} style={styles.row}>
          <Text style={styles.month}>{m.month}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${Math.round(((m.unitPrice ?? 0) / maxPrice) * 100)}%` }]} />
          </View>
          <Text style={styles.value}>{m.unitPrice === null ? '—' : money(m.unitPrice)}</Text>
          <Text style={styles.usage}>{`${m.consumption} ${unit}`}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  content: { padding: theme.spacing[4], gap: theme.spacing[3], maxWidth: 720, width: '100%' as const, alignSelf: 'center' as const },
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: theme.spacing[4] },
  muted: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { ...theme.textStyles.caption, color: theme.colors.textPrimary },
  chipTextActive: { color: theme.colors.textInverse },
  card: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: theme.spacing[4], gap: theme.spacing[2] },
  cardTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  nudge: { ...theme.textStyles.body, color: theme.colors.warning },
  sectionLabel: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[2] },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  month: { ...theme.textStyles.caption, color: theme.colors.textSecondary, width: 56 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.colors.background },
  bar: { height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  value: { ...theme.textStyles.caption, color: theme.colors.textPrimary, width: 64, textAlign: 'right' as const },
  usage: { ...theme.textStyles.caption, color: theme.colors.textTertiary, width: 72, textAlign: 'right' as const },
});
