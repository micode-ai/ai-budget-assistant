import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AccountGroupDto } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { startNewGroup } from '@/features/all-accounts/newGroupGate';

export type ReportScope = 'thisAccount' | 'allAccounts' | 'group';

interface Props {
  scope: ReportScope;
  onScope: (scope: ReportScope) => void;
  groups: AccountGroupDto[];
  groupId: string | null;
  onGroupId: (id: string) => void;
}

/** Scope of a report: the current account, every account, or one Pro account group. */
export function ReportScopePicker({ scope, onScope, groups, groupId, onGroupId }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();

  const options: { key: ReportScope; label: string }[] = [
    { key: 'thisAccount', label: t('allAccounts.reportScope.thisAccount') },
    { key: 'allAccounts', label: t('allAccounts.reportScope.allAccounts') },
    { key: 'group', label: t('allAccounts.reportScope.group') },
  ];

  const choose = (key: ReportScope) => {
    // Groups are Pro: a free user gets the upgrade sheet instead of the option.
    if (key === 'group') void startNewGroup(t, () => onScope('group'));
    else onScope(key);
  };

  return (
    <View>
      <Text style={[styles.label, { marginBottom: theme.spacing[2] }]}>
        {t('allAccounts.reportScope.label')}
      </Text>
      <View style={styles.row}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.key}
            style={[styles.chip, scope === o.key && styles.chipActive]}
            onPress={() => choose(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === o.key }}
          >
            <Text style={[styles.chipText, scope === o.key && styles.chipTextActive]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {scope === 'group' && groups.length === 0 && (
        <TouchableOpacity
          style={{ marginTop: theme.spacing[2] }}
          onPress={() => router.push('/all-accounts')}
          accessibilityRole="link"
        >
          <Text style={[styles.chipText, { color: theme.colors.primary }]}>
            {t('allAccounts.groups.empty')} — {t('allAccounts.groups.title')}
          </Text>
        </TouchableOpacity>
      )}
      {scope === 'group' && groups.length > 0 && (
        <View style={[styles.row, { marginTop: theme.spacing[2] }]}>
          {groups.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[styles.chip, groupId === g.id && styles.chipActive]}
              onPress={() => onGroupId(g.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: groupId === g.id }}
            >
              <Text style={[styles.chipText, groupId === g.id && styles.chipTextActive]}>
                {g.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  label: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
  },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  chip: {
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.textStyles.bodySmMedium, color: theme.colors.textSecondary },
  chipTextActive: { color: '#FFFFFF' },
});
