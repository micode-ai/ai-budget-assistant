import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { CardCycleSummary, UpsertCardCycleDto } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useCardCycle } from '@/features/wallet/useCardCycle';
import { utilisationBar, dayOfMonth, parseDay } from '@/features/wallet/cardCycleDisplay';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { parseAmount } from '@/utils/amount';
import { showAlert } from '@/utils/alert';

/**
 * Credit-card statement cycle on the wallet screen (one component for phone and desktop web: the
 * wallet is a single route on both). Writes nothing but the setting itself; payment stays an
 * account transfer. No interest or minimum-payment copy, by design.
 */
export function CardCycleSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currencyCode = useAccountStore(
    (s) => s.accounts.find((a) => a.id === s.currentAccountId)?.currencyCode ?? 'USD',
  );
  const { status, summary, reload, save, remove } = useCardCycle(accountId);
  const [editing, setEditing] = useState(false);

  if (status === 'loading') return null;

  if (status === 'error') {
    return (
      <TouchableOpacity style={styles.row} onPress={reload} accessibilityRole="button">
        <Ionicons name="refresh-outline" size={20} color={theme.colors.textTertiary} />
        <Text style={styles.rowTextMuted}>{t('cardCycle.loadFailed')}</Text>
      </TouchableOpacity>
    );
  }

  if (!summary) {
    if (!canEdit) return null;
    return (
      <>
        <TouchableOpacity style={styles.row} onPress={() => setEditing(true)} accessibilityRole="button">
          <Ionicons name="card-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.rowText}>{t('cardCycle.setup')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        {editing && (
          <CardCycleSheet
            current={null}
            currencyCode={currencyCode}
            onSave={save}
            onRemove={remove}
            onClose={() => setEditing(false)}
          />
        )}
      </>
    );
  }

  const bar = utilisationBar(summary.utilisation);
  const cur = summary.currencyCode;
  const dueDay = dayOfMonth(summary.dueDate);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('cardCycle.title')}</Text>
        {canEdit && (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={t('cardCycle.edit')}
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.line}>
        {t('cardCycle.thisCycle', {
          amount: formatCurrency(summary.spent, cur),
          statementDay: summary.statementDay,
          dueDay: summary.dueDay,
        })}
      </Text>
      {bar && summary.creditLimit != null && (
        <>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${bar.fill * 100}%`, backgroundColor: bar.over ? theme.colors.danger : theme.colors.primary },
              ]}
            />
          </View>
          <Text style={[styles.caption, bar.over && { color: theme.colors.danger }]}>
            {t(bar.over ? 'cardCycle.overLimit' : 'cardCycle.utilisation', {
              percent: bar.percent,
              limit: formatCurrency(summary.creditLimit, cur),
            })}
          </Text>
        </>
      )}
      {summary.statementAmount != null && dueDay != null && (
        <Text style={styles.closed}>
          {t('cardCycle.closedStatement', {
            amount: formatCurrency(summary.statementAmount, cur),
            day: dueDay,
          })}
        </Text>
      )}
      <Text style={styles.footnote}>{t('cardCycle.cutOffNote')}</Text>
      {editing && (
        <CardCycleSheet
          current={summary}
          currencyCode={currencyCode}
          onSave={save}
          onRemove={remove}
          onClose={() => setEditing(false)}
        />
      )}
    </View>
  );
}

interface SheetProps {
  current: CardCycleSummary | null;
  currencyCode: string;
  onSave: (dto: UpsertCardCycleDto) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

function CardCycleSheet({ current, currencyCode, onSave, onRemove, onClose }: SheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [statement, setStatement] = useState(current ? String(current.statementDay) : '');
  const [due, setDue] = useState(current ? String(current.dueDay) : '');
  const [limit, setLimit] = useState(current?.creditLimit != null ? String(current.creditLimit) : '');
  const [busy, setBusy] = useState(false);

  const cardCurrency = current?.currencyCode ?? currencyCode;
  const statementDay = parseDay(statement);
  const dueDay = parseDay(due);
  const limitValue = limit.trim() === '' ? undefined : parseAmount(limit);
  const limitValid = limitValue === undefined || (Number.isFinite(limitValue) && limitValue > 0);
  const valid = statementDay != null && dueDay != null && limitValid;

  const submit = async () => {
    if (statementDay == null || dueDay == null || !limitValid || busy) return;
    setBusy(true);
    try {
      await onSave({
        statementDay,
        dueDay,
        ...(limitValue !== undefined ? { creditLimit: limitValue } : {}),
        currencyCode: cardCurrency,
      });
      onClose();
    } catch (e) {
      console.warn('Card cycle save failed:', e);
      showAlert(t('cardCycle.title'), t('cardCycle.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    setBusy(true);
    try {
      await onRemove();
      onClose();
    } catch (e) {
      console.warn('Card cycle remove failed:', e);
      showAlert(t('cardCycle.title'), t('cardCycle.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: theme.spacing[5] + insets.bottom + keyboardHeight }]}>
        <Text style={styles.sheetTitle}>{t('cardCycle.sheetTitle')}</Text>
        <Text style={styles.fieldLabel}>{t('cardCycle.statementDay')}</Text>
        <TextInput
          style={styles.input}
          value={statement}
          onChangeText={setStatement}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="1-31"
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={t('cardCycle.statementDay')}
        />
        <Text style={styles.fieldLabel}>{t('cardCycle.dueDay')}</Text>
        <TextInput
          style={styles.input}
          value={due}
          onChangeText={setDue}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="1-31"
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={t('cardCycle.dueDay')}
        />
        <Text style={styles.fieldLabel}>{t('cardCycle.limit', { currency: cardCurrency })}</Text>
        <TextInput
          style={styles.input}
          value={limit}
          onChangeText={setLimit}
          keyboardType="decimal-pad"
          placeholder={t('cardCycle.limitPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={t('cardCycle.limit', { currency: cardCurrency })}
        />
        {!valid && (statement !== '' || due !== '' || limit !== '') && (
          <Text style={[styles.caption, { color: theme.colors.danger }]}>{t('cardCycle.invalid')}</Text>
        )}
        <Text style={styles.footnote}>{t('cardCycle.cutOffNote')}</Text>
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
            <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primary, (!valid || busy) && styles.disabled]}
            onPress={submit}
            disabled={!valid || busy}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </View>
        {current && (
          <TouchableOpacity style={styles.removeButton} onPress={doRemove} disabled={busy}>
            <Text style={[styles.secondaryText, { color: theme.colors.danger }]}>{t('cardCycle.remove')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[3],
  },
  rowText: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  rowTextMuted: { ...theme.textStyles.body, color: theme.colors.textSecondary, flex: 1 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  line: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    overflow: 'hidden' as const,
    marginTop: theme.spacing[3],
  },
  fill: { height: 6, borderRadius: 3 },
  caption: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
  closed: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginTop: theme.spacing[3] },
  footnote: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[3] },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    maxWidth: 520,
    alignSelf: 'center' as const,
  },
  sheetTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  fieldLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  input: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
  },
  buttons: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[4] },
  primary: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
  },
  primaryText: { ...theme.textStyles.bodyLargeSemiBold, color: '#FFFFFF' },
  secondary: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center' as const,
  },
  secondaryText: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textSecondary },
  removeButton: { alignItems: 'center' as const, paddingVertical: theme.spacing[3], marginTop: theme.spacing[1] },
  disabled: { opacity: 0.5 },
});
