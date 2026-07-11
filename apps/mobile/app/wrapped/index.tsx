import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Switch,
  Platform,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { useWrapped } from '@/features/insights/useWrapped';
import {
  WrappedShareCard,
  type WrappedShareCardHandle,
  type WrappedSharePayload,
  type WrappedShareLine,
} from '@/components/wrapped/WrappedShareCard';
import type { WrappedCard } from '@budget/shared-types';

// Curated gradient per card type — gives the deck a lively, "wrapped" feel.
const GRADIENTS: Record<WrappedCard['type'], [string, string]> = {
  intro: ['#7C3AED', '#DB2777'],
  total_tracked: ['#2563EB', '#0EA5E9'],
  top_merchant: ['#DB2777', '#F97316'],
  biggest_month: ['#7C3AED', '#2563EB'],
  top_category: ['#059669', '#10B981'],
  category_mix: ['#0891B2', '#22D3EE'],
  receipts_scanned: ['#D97706', '#F59E0B'],
  savings: ['#059669', '#14B8A6'],
  personal_inflation: ['#DC2626', '#F97316'],
  streak: ['#EA580C', '#F59E0B'],
  outro: ['#7C3AED', '#DB2777'],
};

export default function WrappedScreen() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const intlLocale = getIntlLocale();
  const { width, height } = useWindowDimensions();

  const params = useLocalSearchParams<{ year?: string }>();
  const year = params.year ? Number(params.year) : undefined;

  const { data, loading, error } = useWrapped(year);
  const [index, setIndex] = useState(0);
  const [hideAmounts, setHideAmounts] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const shareCardRef = useRef<WrappedShareCardHandle>(null);

  const baseCurrency = data?.baseCurrency ?? 'USD';

  const money = useCallback(
    (n: number) => (hideAmounts ? '•••' : formatCurrency(n, baseCurrency)),
    [hideAmounts, baseCurrency],
  );

  const monthLabel = useCallback(
    (monthIndex: number, y: number) => {
      const name = new Date(y, monthIndex, 1).toLocaleDateString(intlLocale, { month: 'long' });
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
    },
    [intlLocale],
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  const buildShareMessage = useCallback((): string => {
    if (!data) return '';
    const lines: string[] = [t('wrapped.shareTitle', { year: data.year })];
    for (const c of data.cards) {
      switch (c.type) {
        case 'total_tracked':
          lines.push(`💸 ${t('wrapped.shareSpent', { value: money(c.totalExpenses) })}`);
          break;
        case 'top_merchant':
          lines.push(`🏪 ${t('wrapped.shareMerchant', { name: c.name, count: c.visits })}`);
          break;
        case 'biggest_month':
          lines.push(`📅 ${t('wrapped.shareMonth', { month: monthLabel(c.monthIndex, data.year) })}`);
          break;
        case 'top_category':
          lines.push(`🏆 ${t('wrapped.shareCategory', { name: c.name, percent: c.percentage })}`);
          break;
        case 'receipts_scanned':
          lines.push(`🧾 ${t('wrapped.shareReceipts', { count: c.count })}`);
          break;
        case 'savings':
          lines.push(`💰 ${t('wrapped.shareSaved', { value: money(c.netSavings) })}`);
          break;
        case 'personal_inflation':
          if (c.indexPct != null) {
            lines.push(`📈 ${t('wrapped.shareInflation', { percent: c.indexPct })}`);
          }
          break;
        case 'streak':
          lines.push(`🔥 ${t('wrapped.shareStreak', { count: c.longestStreak })}`);
          break;
        default:
          break;
      }
    }
    lines.push('');
    lines.push(t('wrapped.shareCta'));
    return lines.join('\n');
  }, [data, t, money, monthLabel]);

  // Same per-card selection as buildShareMessage above, restructured into
  // {emoji,label} rows for the rendered story-card image. `money()` already
  // honors hideAmounts, so masked values flow through here identically to
  // the text-share path.
  const buildSharePayload = useCallback((): WrappedSharePayload | null => {
    if (!data) return null;
    const lines: WrappedShareLine[] = [];
    const push = (emoji: string, label: string) => lines.push({ emoji, label, value: '' });
    for (const c of data.cards) {
      switch (c.type) {
        case 'total_tracked':
          push('💸', t('wrapped.shareSpent', { value: money(c.totalExpenses) }));
          break;
        case 'top_merchant':
          push('🏪', t('wrapped.shareMerchant', { name: c.name, count: c.visits }));
          break;
        case 'biggest_month':
          push('📅', t('wrapped.shareMonth', { month: monthLabel(c.monthIndex, data.year) }));
          break;
        case 'top_category':
          push('🏆', t('wrapped.shareCategory', { name: c.name, percent: c.percentage }));
          break;
        case 'receipts_scanned':
          push('🧾', t('wrapped.shareReceipts', { count: c.count }));
          break;
        case 'savings':
          push('💰', t('wrapped.shareSaved', { value: money(c.netSavings) }));
          break;
        case 'personal_inflation':
          if (c.indexPct != null) {
            push('📈', t('wrapped.shareInflation', { percent: c.indexPct }));
          }
          break;
        case 'streak':
          push('🔥', t('wrapped.shareStreak', { count: c.longestStreak }));
          break;
        default:
          break;
      }
    }
    return {
      year: data.year,
      title: t('wrapped.shareTitle', { year: data.year }),
      lines,
      footer: t('wrapped.shareCta'),
    };
  }, [data, t, money, monthLabel]);

  const onShare = useCallback(async () => {
    // Native: try the rendered PNG story card first; fall back to the text
    // share on any failure so the button is never a dead end. Web keeps the
    // text-only path — the WebView-canvas + expo-sharing file share is
    // unreliable in a browser context.
    if (Platform.OS !== 'web') {
      const payload = buildSharePayload();
      if (payload) {
        try {
          const ok = await shareCardRef.current?.share(payload);
          if (ok) return;
        } catch {
          // fall through to text share
        }
      }
    }
    try {
      await Share.share({ message: buildShareMessage() });
    } catch {
      // user dismissed / share unavailable — no-op
    }
  }, [buildShareMessage, buildSharePayload]);

  // ── Loading / error / empty states ──────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={styles.spinner.color} />
      </SafeAreaView>
    );
  }

  if (error || !data || !data.hasEnoughData) {
    return (
      <SafeAreaView style={styles.centered}>
        <TouchableOpacity style={styles.closeAbsolute} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={styles.emptyText.color} />
        </TouchableOpacity>
        <Ionicons name="sparkles-outline" size={48} color={styles.emptyText.color} />
        <Text style={styles.emptyTitle}>{t('wrapped.notEnoughData')}</Text>
        <Text style={styles.emptyText}>{t('wrapped.notEnoughDataDesc')}</Text>
      </SafeAreaView>
    );
  }

  const cardWidth = width;
  const cardHeight = height;

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {data.cards.map((card, i) => (
          <LinearGradient
            key={`${card.type}-${i}`}
            colors={GRADIENTS[card.type]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, { width: cardWidth, height: cardHeight }]}
          >
            <SafeAreaView style={styles.cardSafe}>
              <View style={styles.cardBody}>{renderCard(card, data.year)}</View>
            </SafeAreaView>
          </LinearGradient>
        ))}
      </ScrollView>

      {/* Overlay chrome: close + progress dots */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.dots}>
            {data.cards.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <View style={{ width: 28 }} />
        </View>
      </SafeAreaView>

      {/* Hidden off-screen renderer for the "share as image" story card (native only). */}
      {Platform.OS !== 'web' && <WrappedShareCard ref={shareCardRef} />}
    </View>
  );

  // Renders the inner content for one card (icon + big value + label + sub).
  function renderCard(card: WrappedCard, y: number) {
    switch (card.type) {
      case 'intro':
        return (
          <>
            <Text style={styles.emoji}>🎁</Text>
            <Text style={styles.bigTitle}>{t('wrapped.introTitle', { year: card.year })}</Text>
            <Text style={styles.sub}>{t('wrapped.introSub')}</Text>
            <Text style={styles.swipeHint}>{t('wrapped.swipeHint')}</Text>
          </>
        );
      case 'total_tracked':
        return (
          <>
            <Text style={styles.emoji}>💸</Text>
            <Text style={styles.label}>{t('wrapped.totalTracked')}</Text>
            <Text style={styles.hero}>{money(card.totalExpenses)}</Text>
            <Text style={styles.sub}>{t('wrapped.spentLabel')}</Text>
            <View style={styles.statRow}>
              <Stat value={money(card.totalIncome)} label={t('wrapped.earnedLabel')} styles={styles} />
              <Stat value={String(card.transactionCount)} label={t('wrapped.transactions')} styles={styles} />
            </View>
          </>
        );
      case 'top_merchant':
        return (
          <>
            <Text style={styles.emoji}>🏪</Text>
            <Text style={styles.label}>{t('wrapped.topMerchant')}</Text>
            <Text style={styles.hero}>{card.name}</Text>
            <Text style={styles.sub}>{t('wrapped.merchantVisits', { count: card.visits })}</Text>
            <Text style={styles.subSmall}>{t('wrapped.merchantSpent', { value: money(card.totalSpent) })}</Text>
          </>
        );
      case 'biggest_month':
        return (
          <>
            <Text style={styles.emoji}>📅</Text>
            <Text style={styles.label}>{t('wrapped.biggestMonth')}</Text>
            <Text style={styles.hero}>{monthLabel(card.monthIndex, y)}</Text>
            <Text style={styles.sub}>{money(card.amount)}</Text>
          </>
        );
      case 'top_category':
        return (
          <>
            <Text style={styles.emoji}>🏆</Text>
            <Text style={styles.label}>{t('wrapped.topCategory')}</Text>
            <Text style={styles.hero}>{card.name}</Text>
            <Text style={styles.sub}>{money(card.amount)}</Text>
            <Text style={styles.subSmall}>{t('wrapped.ofSpending', { percent: card.percentage })}</Text>
          </>
        );
      case 'category_mix':
        return (
          <>
            <Text style={styles.emoji}>🎨</Text>
            <Text style={styles.label}>{t('wrapped.categoryMix')}</Text>
            <View style={styles.mixList}>
              {card.categories.map((c, i) => (
                <View key={`${c.categoryId ?? 'x'}-${i}`} style={styles.mixRow}>
                  <View style={[styles.mixDot, { backgroundColor: c.color ?? '#ffffff88' }]} />
                  <Text style={styles.mixName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.mixPct}>{c.percentage}%</Text>
                </View>
              ))}
            </View>
          </>
        );
      case 'receipts_scanned':
        return (
          <>
            <Text style={styles.emoji}>🧾</Text>
            <Text style={styles.hero}>{card.count}</Text>
            <Text style={styles.label}>{t('wrapped.receiptsScanned')}</Text>
            <Text style={styles.sub}>{t('wrapped.receiptsScannedDesc')}</Text>
          </>
        );
      case 'savings': {
        const positive = card.netSavings >= 0;
        return (
          <>
            <Text style={styles.emoji}>{positive ? '💰' : '📉'}</Text>
            <Text style={styles.label}>{positive ? t('wrapped.saved') : t('wrapped.overspent')}</Text>
            <Text style={styles.hero}>{money(Math.abs(card.netSavings))}</Text>
            {card.savingsRate != null && (
              <Text style={styles.sub}>{t('wrapped.savingsRate', { percent: card.savingsRate })}</Text>
            )}
            {card.savedVsLastYear != null && (
              <Text style={styles.subSmall}>
                {t('wrapped.savedVsLastYear', {
                  value: money(Math.abs(card.savedVsLastYear)),
                  direction: card.savedVsLastYear >= 0 ? '▲' : '▼',
                })}
              </Text>
            )}
          </>
        );
      }
      case 'personal_inflation':
        return (
          <>
            <Text style={styles.emoji}>📈</Text>
            <Text style={styles.label}>{t('wrapped.personalInflation')}</Text>
            <Text style={styles.hero}>{card.indexPct != null ? `${card.indexPct > 0 ? '+' : ''}${card.indexPct}%` : '—'}</Text>
            <Text style={styles.sub}>{t('wrapped.inflationDesc')}</Text>
          </>
        );
      case 'streak':
        return (
          <>
            <Text style={styles.emoji}>🔥</Text>
            <Text style={styles.hero}>{t('wrapped.streakDays', { count: card.longestStreak })}</Text>
            <Text style={styles.label}>{t('wrapped.longestStreak')}</Text>
          </>
        );
      case 'outro':
        return (
          <>
            <Text style={styles.emoji}>✨</Text>
            <Text style={styles.bigTitle}>{t('wrapped.outroTitle', { year: card.year })}</Text>
            <Text style={styles.sub}>{t('wrapped.outroDesc')}</Text>
            <View style={styles.hideRow}>
              <Text style={styles.hideLabel}>{t('wrapped.hideAmounts')}</Text>
              <Switch value={hideAmounts} onValueChange={setHideAmounts} />
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={onShare} activeOpacity={0.85}>
              <Ionicons name="share-social" size={20} color="#111" />
              <Text style={styles.shareBtnText}>{t('wrapped.share')}</Text>
            </TouchableOpacity>
          </>
        );
      default:
        return null;
    }
  }
}

function Stat({ value, label, styles }: { value: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  root: { flex: 1, backgroundColor: '#000' },
  spinner: { color: theme.colors.primary },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.background,
    padding: 32,
    gap: 12,
  },
  closeAbsolute: { position: 'absolute' as const, top: 48, left: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700' as const, color: theme.colors.textPrimary, textAlign: 'center' as const },
  emptyText: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center' as const },
  card: { flex: 1 },
  cardSafe: { flex: 1 },
  cardBody: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 32,
    gap: 12,
  },
  emoji: { fontSize: 64, marginBottom: 8 },
  bigTitle: { fontSize: 34, fontWeight: '800' as const, color: '#fff', textAlign: 'center' as const },
  hero: { fontSize: 40, fontWeight: '800' as const, color: '#fff', textAlign: 'center' as const },
  label: { fontSize: 15, fontWeight: '600' as const, color: '#ffffffcc', textTransform: 'uppercase' as const, letterSpacing: 1 },
  sub: { fontSize: 20, fontWeight: '600' as const, color: '#fff', textAlign: 'center' as const },
  subSmall: { fontSize: 15, color: '#ffffffcc', textAlign: 'center' as const },
  swipeHint: { fontSize: 13, color: '#ffffffaa', marginTop: 24 },
  statRow: { flexDirection: 'row' as const, gap: 32, marginTop: 20 },
  stat: { alignItems: 'center' as const },
  statValue: { fontSize: 22, fontWeight: '700' as const, color: '#fff' },
  statLabel: { fontSize: 13, color: '#ffffffcc', marginTop: 2 },
  mixList: { width: '100%' as const, gap: 12, marginTop: 12 },
  mixRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  mixDot: { width: 12, height: 12, borderRadius: 6 },
  mixName: { flex: 1, fontSize: 16, fontWeight: '600' as const, color: '#fff' },
  mixPct: { fontSize: 16, fontWeight: '700' as const, color: '#fff' },
  overlay: { position: 'absolute' as const, top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  dots: { flexDirection: 'row' as const, gap: 6, flex: 1, justifyContent: 'center' as const, flexWrap: 'wrap' as const },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffffff55' },
  dotActive: { backgroundColor: '#fff', width: 9, height: 9, borderRadius: 5 },
  hideRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginTop: 16 },
  hideLabel: { fontSize: 15, color: '#fff', fontWeight: '600' as const },
  shareBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 12,
  },
  shareBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#111' },
});
