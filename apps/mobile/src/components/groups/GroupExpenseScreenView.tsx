import React, { forwardRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { GroupExpense } from '@budget/shared-types';
import { GroupErrorState } from './GroupErrorState';
import { GroupExpenseForm } from './GroupExpenseForm';
import type { GroupFormHandle, GroupFormState } from './groupFormHandle';

interface GroupExpenseScreenViewProps {
  groupId: string;
  expenseId?: string;
  /**
   * Desktop dialog hosting (ABA-646). `withStackTitle` (default true) keeps the route's header
   * title; a hosted copy passes false, or it would retitle the route underneath the dialog. The
   * rest are forwarded to the form untouched; the phone passes none of them.
   */
  withStackTitle?: boolean;
  hideActions?: boolean;
  onStateChange?: (state: GroupFormState) => void;
  onDone?: () => void;
}

/**
 * Loads the group (the form is seeded once from it) and, when editing, finds the expense in the
 * loaded activity. Renders the form only when everything it needs is present. The ref handle is
 * the form's, and is null until the form has mounted.
 */
export const GroupExpenseScreenView = forwardRef<GroupFormHandle, GroupExpenseScreenViewProps>(
  function GroupExpenseScreenView(
    { groupId, expenseId, withStackTitle = true, hideActions, onStateChange, onDone },
    ref,
  ) {
    const { t } = useTranslation();
    const theme = useTheme();
    const styles = useStyles(createStyles);
    const { detail, loadFailed, reload } = useGroupDetail(groupId);
    const activity = useGroupStore((s) => s.activity);

    const found = expenseId
      ? activity.find((i) => i.kind === 'expense' && i.expense.id === expenseId)
      : undefined;
    const existing: GroupExpense | null = found && found.kind === 'expense' ? found.expense : null;

    const title = expenseId ? t('groups.expenseEditTitle') : t('groups.expenseAddTitle');
    const ready = !!detail && (!expenseId || !!existing);

    return (
      <SafeAreaView style={styles.container} edges={[]}>
        {withStackTitle && <Stack.Screen options={{ title }} />}
        {ready && detail ? (
          // Keyed so a different expense never inherits another one's seeded state.
          <GroupExpenseForm
            key={expenseId ?? 'new'}
            ref={ref}
            detail={detail}
            existing={existing}
            hideActions={hideActions}
            onStateChange={onStateChange}
            onDone={onDone}
          />
        ) : loadFailed || (detail && expenseId && !existing) ? (
          <GroupErrorState onRetry={reload} />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  },
);

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
