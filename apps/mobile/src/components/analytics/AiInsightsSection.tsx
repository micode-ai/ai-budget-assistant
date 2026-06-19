import { View, Text, TouchableOpacity, LayoutAnimation } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useUpgradeStore } from '@/stores/upgradeStore';

interface AiInsight {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  actionSuggestion?: string;
}

interface Props {
  aiInsights: AiInsight[];
  proGated?: boolean;
}

export function AiInsightsSection({ aiInsights, proGated }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);
  const showUpgrade = useUpgradeStore((s) => s.show);

  const toggleInsight = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedInsightId((prev) => (prev === id ? null : id));
  }, []);

  if (proGated) {
    return (
      <TouchableOpacity
        style={styles.proGatedCard}
        activeOpacity={0.8}
        onPress={() => showUpgrade(t('insights.proRequired'), 'pro')}
      >
        <Ionicons name="lock-closed" size={20} color={theme.colors.warning} />
        <Text style={styles.proGatedTitle}>{t('insights.aiSuggested')}</Text>
        <Text style={styles.proGatedSubtitle}>{t('insights.proRequired')}</Text>
        <View style={styles.proGatedChip}>
          <Text style={styles.proGatedChipText}>{t('subscription.upgrade')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (aiInsights.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="sparkles" size={16} color={theme.colors.warning} />
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t('insights.aiSuggested')}</Text>
        <View style={{ flex: 1 }} />
        <AiUsageBadge />
      </View>
      {aiInsights.slice(0, 5).map((insight) => {
        const isExpanded = expandedInsightId === insight.id;
        const severityColor =
          insight.severity === 'critical'
            ? theme.colors.danger
            : insight.severity === 'warning'
              ? theme.colors.warning
              : theme.colors.info;
        const severityBg =
          insight.severity === 'critical'
            ? theme.colors.dangerLight
            : insight.severity === 'warning'
              ? theme.colors.warningLight
              : theme.colors.primaryLight;
        return (
          <TouchableOpacity
            key={insight.id}
            style={styles.aiInsightCard}
            activeOpacity={0.7}
            onPress={() => toggleInsight(insight.id)}
          >
            <View style={styles.aiInsightHeader}>
              <View style={[styles.aiSeverityBadge, { backgroundColor: severityBg }]}>
                <Ionicons
                  name={
                    insight.severity === 'critical'
                      ? 'alert-circle'
                      : insight.severity === 'warning'
                        ? 'warning'
                        : 'information-circle'
                  }
                  size={16}
                  color={severityColor}
                />
              </View>
              <Text style={styles.aiInsightTitle} numberOfLines={isExpanded ? undefined : 1}>
                {insight.title}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textTertiary}
              />
            </View>
            <Text style={styles.aiInsightDescription} numberOfLines={isExpanded ? undefined : 2}>
              {insight.description}
            </Text>
            {insight.actionSuggestion && (
              <View style={styles.aiInsightAction}>
                <Ionicons name="bulb-outline" size={14} color={theme.colors.primary} />
                <Text style={styles.aiInsightActionText} numberOfLines={isExpanded ? undefined : 1}>
                  {insight.actionSuggestion}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  proGatedCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.warningLight,
    ...theme.shadows.sm,
  },
  proGatedTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  proGatedSubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  proGatedChip: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    marginTop: theme.spacing[1],
  },
  proGatedChipText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: theme.colors.textInverse,
  },
  section: {
    marginBottom: theme.spacing[5],
  },
  sectionTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  aiInsightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[2],
    ...theme.shadows.sm,
  },
  aiInsightHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  aiSeverityBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  aiInsightTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  aiInsightDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  aiInsightAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[3],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  aiInsightActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    flex: 1,
  },
});
