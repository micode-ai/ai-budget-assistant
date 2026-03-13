import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ChatPendingAction } from '@budget/shared-types';

const ACTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  create_expense: 'receipt-outline',
  create_income: 'cash-outline',
  create_budget: 'pie-chart-outline',
  create_category: 'folder-outline',
};

interface ActionConfirmationCardProps {
  pendingAction: ChatPendingAction;
  onConfirm: (actionId: string) => void;
  onReject: (actionId: string) => void;
  isConfirming: boolean;
}

export function ActionConfirmationCard({
  pendingAction,
  onConfirm,
  onReject,
  isConfirming,
}: ActionConfirmationCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const icon = ACTION_ICONS[pendingAction.actionType] || 'create-outline';
  const data = pendingAction.data as Record<string, unknown>;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>{t('chat.confirmTitle')}</Text>
      </View>

      <Text style={styles.summary}>{pendingAction.displaySummary}</Text>

      {'amount' in data && data.amount != null ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('chat.amount')}:</Text>
          <Text style={styles.detailValue}>
            {Number(data.amount).toFixed(2)} {String(data.currencyCode || '')}
          </Text>
        </View>
      ) : null}
      {'categoryName' in data && data.categoryName ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('chat.category')}:</Text>
          <Text style={styles.detailValue}>{String(data.categoryName)}</Text>
        </View>
      ) : null}
      {'date' in data || 'startDate' in data ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('chat.date')}:</Text>
          <Text style={styles.detailValue}>{String(data.date || data.startDate || '')}</Text>
        </View>
      ) : null}
      {'period' in data && data.period ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('chat.period')}:</Text>
          <Text style={styles.detailValue}>{String(data.period)}</Text>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => onReject(pendingAction.id)}
          disabled={isConfirming}
        >
          <Text style={styles.rejectButtonText}>{t('chat.rejectAction')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmButton, isConfirming && styles.buttonDisabled]}
          onPress={() => onConfirm(pendingAction.id)}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmButtonText}>{t('chat.confirmAction')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  summary: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  detailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[1],
  },
  detailLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  detailValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  confirmButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  confirmButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: '#FFFFFF',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rejectButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
