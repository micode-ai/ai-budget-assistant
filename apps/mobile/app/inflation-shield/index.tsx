import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Share, Switch, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInflationShield } from '@/features/insights/useInflationShield';
import { useInflationShieldStore } from '@/stores/inflationShieldStore';
import { InflationShieldShareCard, type InflationShieldShareCardHandle } from '@/components/insights/InflationShieldShareCard';
import { buildShieldSharePayload, buildShieldShareMessage } from '@/features/insights/shieldShare';

export default function InflationShieldScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { data, loading, hasEnoughData } = useInflationShield();
  const load = useInflationShieldStore((s) => s.load);

  const currency = data?.baseCurrency ?? 'USD';
  const items = data?.items ?? [];

  const shareCardRef = useRef<InflationShieldShareCardHandle>(null);
  const [hideAmounts, setHideAmounts] = useState(false);

  const money = useCallback(
    (n: number) => (hideAmounts ? '•••' : formatCurrency(n, currency)),
    [hideAmounts, currency],
  );

  const onShare = useCallback(async () => {
    if (!data) return;
    if (Platform.OS !== 'web') {
      const payload = buildShieldSharePayload(data, { hideAmounts, money, t });
      if (payload) {
        try {
          const ok = await shareCardRef.current?.share(payload);
          if (ok) return;
        } catch {
          // fall through to text share
        }
      }
    }
    const message = buildShieldShareMessage(data, { hideAmounts, money, t });
    if (!message) return;
    try {
      await Share.share({ message });
    } catch {
      // user dismissed / unavailable — no-op
    }
  }, [data, hideAmounts, money, t]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.primary} />}
      >
        {/* Hero: saved so far */}
        <View style={styles.hero}>
          <Ionicons name="shield-checkmark" size={28} color={theme.colors.primary} />
          <Text style={styles.heroValue}>{formatCurrency(data?.savedSoFar ?? 0, currency)}</Text>
          <Text style={styles.heroLabel}>{t('inflationShield.savedSoFar')} · {t('inflationShield.estimated')}</Text>
          {data?.basketMonthlyForecastPct != null && (
            <Text style={styles.basket}>
              {t('inflationShield.basketForecast', { pct: data.basketMonthlyForecastPct.toFixed(1) })}
            </Text>
          )}
          {hasEnoughData && data && (data.items.length > 0 || (data.savedSoFar ?? 0) > 0) && (
            <>
              <TouchableOpacity style={styles.shareBtn} onPress={onShare} activeOpacity={0.8}>
                <Ionicons name="share-outline" size={18} color={theme.colors.textInverse} />
                <Text style={styles.shareBtnText}>{t('inflationShield.share')}</Text>
              </TouchableOpacity>
              <View style={styles.hideRow}>
                <Text style={styles.hideLabel}>{t('inflationShield.hideAmounts')}</Text>
                <Switch value={hideAmounts} onValueChange={setHideAmounts} />
              </View>
            </>
          )}
        </View>

        {loading && items.length === 0 ? (
          <ActivityIndicator style={styles.spinner} size="large" color={theme.colors.primary} />
        ) : !hasEnoughData || items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('inflationShield.empty')}</Text>
            <Text style={styles.emptySub}>{t('inflationShield.emptySub')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t('inflationShield.buyAheadTitle')}</Text>
            {items.map((it, idx) => (
              <View key={idx} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.canonicalName}</Text>
                  <Text style={styles.itemRise}>+{it.monthlyChangePct.toFixed(0)}%</Text>
                </View>
                <Text style={styles.itemAction}>
                  {t('inflationShield.buyAheadTip', { product: t('inflationShield.units', { count: it.quantity }), save: formatCurrency(it.projectedSaving, currency) })}
                </Text>
                <View style={styles.itemMeta}>
                  {it.store && <Text style={styles.itemStore}>{t('inflationShield.atStore', { store: it.store })}</Text>}
                  {it.affordableToday && (
                    <View style={styles.affordBadge}>
                      <Ionicons name="checkmark-circle" size={13} color={theme.colors.success} />
                      <Text style={styles.affordText}>{t('inflationShield.affordable')}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
            {data?.fxApproximate && <Text style={styles.approx}>{t('inflationShield.approxRate')}</Text>}
          </>
        )}
      </ScrollView>
      {Platform.OS !== 'web' && <InflationShieldShareCard ref={shareCardRef} />}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4] },
  hero: { alignItems: 'center' as const, paddingVertical: theme.spacing[6], gap: theme.spacing[1] },
  heroValue: { ...theme.textStyles.h1, color: theme.colors.success, marginTop: theme.spacing[2] },
  heroLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
  basket: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: theme.spacing[2] },
  shareBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: theme.spacing[2], alignSelf: 'center' as const, marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[2.5], paddingHorizontal: theme.spacing[5],
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
  },
  shareBtnText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  hideRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: theme.spacing[2], marginTop: theme.spacing[2] },
  hideLabel: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  spinner: { paddingVertical: theme.spacing[10] },
  empty: { alignItems: 'center' as const, paddingVertical: theme.spacing[10], gap: theme.spacing[2] },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  emptySub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, textAlign: 'center' as const },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  itemHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
  itemName: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing[2] },
  itemRise: { ...theme.textStyles.bodySmMedium, color: theme.colors.danger },
  itemAction: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
  itemMeta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3], marginTop: theme.spacing[2] },
  itemStore: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  affordBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[1] },
  affordText: { ...theme.textStyles.caption, color: theme.colors.success },
  approx: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: theme.spacing[2], textAlign: 'center' as const },
});
