import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import type { ChildStatementController } from '@/features/children/useChildStatement';
import {
  STATEMENT_PERIODS,
  statementPeriod,
  type StatementGate,
  type StatementPeriodKind,
} from '@/features/children/statementGate';
import { useTheme, useStyles, type Theme } from '@/theme';

const TITLE_ID = 'child-statement-title';

interface Props {
  visible: boolean;
  onClose: () => void;
  statement: ChildStatementController;
  /** The synchronous gate when the dialog opened (`viewer` shows why; `pro` never opens it). */
  gate: StatementGate;
}

/**
 * The Statement PDF dialog, shared by the phone and desktop layouts (a sheet
 * on the phone, a centred panel on desktop — `SheetDialog`'s split): pick a
 * period, create. Every refusal says why, in place — a viewer, an encrypted
 * account, changes still waiting to sync, or a failed request.
 */
export function ChildStatementDialog({ visible, onClose, statement, gate }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [period, setPeriod] = useState<StatementPeriodKind>('thisYear');
  const { status } = statement;
  const working = status.kind === 'working';
  const blocked = gate === 'viewer';

  const close = () => {
    if (working) return;
    statement.reset();
    onClose();
  };

  let message: string | null = null;
  if (blocked) message = t('childCosts.statement.viewer');
  else if (status.kind === 'saved') message = t('childCosts.statement.saved', { location: status.location });
  else if (status.kind === 'refused') message = t(`childCosts.statement.${status.reason}`);

  return (
    <SheetDialog visible={visible} onClose={close} titleId={TITLE_ID} dismissable={!working}>
      <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
        {t('childCosts.statement.dialogTitle')}
      </Text>
      <Text style={styles.note}>{t('childCosts.statement.note')}</Text>

      <Text style={styles.label}>{t('childCosts.statement.periodLabel')}</Text>
      <View accessibilityRole="radiogroup" style={styles.periods}>
        {STATEMENT_PERIODS.map((kind) => {
          const selected = kind === period;
          const range = statementPeriod(kind);
          return (
            <TouchableOpacity
              key={kind}
              style={[styles.period, selected && styles.periodSelected]}
              onPress={() => {
                setPeriod(kind);
                statement.reset();
              }}
              disabled={working || blocked}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: working || blocked }}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? theme.colors.primary : theme.colors.textTertiary}
              />
              <View style={styles.periodText}>
                <Text style={styles.periodName}>{t(`childCosts.statement.${kind}`)}</Text>
                <Text style={styles.periodRange}>{t('childCosts.statement.range', range)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {statement.undeliverableLines > 0 && !working && (
        <Text style={styles.note} accessibilityLiveRegion="polite">
          {t('childCosts.statement.undeliverableLines', { n: statement.undeliverableLines })}
        </Text>
      )}

      {message && (
        <Text
          style={status.kind === 'saved' && !blocked ? styles.success : styles.error}
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={close}
          disabled={working}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t(status.kind === 'saved' ? 'common.done' : 'common.cancel')}</Text>
        </TouchableOpacity>
        {!blocked && (
          <TouchableOpacity
            style={[styles.primaryButton, working && styles.disabled]}
            onPress={() => void statement.request(period)}
            disabled={working}
            accessibilityRole="button"
            accessibilityState={{ disabled: working, busy: working }}
            accessibilityLabel={working ? t('childCosts.statement.creating') : t('childCosts.statement.create')}
          >
            {working ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.primaryText}>{t('childCosts.statement.create')}</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  note: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[4] },
  label: { ...theme.textStyles.bodySmMedium, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  periods: { gap: theme.spacing[2] },
  period: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
  },
  periodSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceSecondary },
  periodText: { flex: 1 },
  periodName: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  periodRange: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  error: { ...theme.textStyles.bodySm, color: theme.colors.danger, marginTop: theme.spacing[3] },
  // Body text, not `success`: the green fails contrast as text on a light sheet.
  success: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, marginTop: theme.spacing[3] },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[5],
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    minWidth: 140,
    alignItems: 'center' as const,
  },
  primaryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  secondaryButton: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  disabled: { opacity: 0.6 },
});
