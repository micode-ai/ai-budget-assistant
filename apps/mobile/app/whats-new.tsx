import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { WHATS_NEW_ENTRIES, type WhatsNewEntry } from '@/features/whatsNew/whatsNewEntries';

/**
 * Full, on-demand browsable history of `WHATS_NEW_ENTRIES` — see
 * docs/contracts/whats-new-spotlight.md. Reachable any time from Settings,
 * independent of the one-time spotlight; browsing this list never calls
 * `markSeen` (only the spotlight and its own CTA do).
 */
export default function WhatsNewScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // Newest first for browsing, even though the underlying list is stored
  // oldest-first (append-only, so new entries are added at the end).
  const entries = [...WHATS_NEW_ENTRIES].reverse();

  function openEntry(entry: WhatsNewEntry) {
    const target = entry.route ?? (entry.helpSectionId ? `/help/${entry.helpSectionId}` : null);
    if (target) router.push(target as any);
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {entries.map((entry) => (
          <TouchableOpacity
            key={entry.id}
            style={styles.card}
            onPress={() => openEntry(entry)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{entry.title}</Text>
              {entry.tier && (
                <View style={[styles.tierBadge, { backgroundColor: theme.colors.warning + '20' }]}>
                  <Text style={[styles.tierBadgeText, { color: theme.colors.warning }]}>
                    {t(entry.tier === 'business' ? 'whatsNew.tierBusiness' : 'whatsNew.tierPro')}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.cardBody}>{entry.body}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardCta}>{t('whatsNew.actionLearnMore')}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
            </View>
          </TouchableOpacity>
        ))}
        {entries.length === 0 && (
          <Text style={styles.emptyState}>{t('whatsNew.emptyState')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1 as const,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1 as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  cardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  cardTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1 as const,
  },
  tierBadge: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  tierBadgeText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
  },
  cardBody: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 19,
    marginBottom: theme.spacing[2],
  },
  cardFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  cardCta: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  emptyState: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[8],
  },
});
