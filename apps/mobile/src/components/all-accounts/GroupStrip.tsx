import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AccountGroupDto } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  groups: AccountGroupDto[];
  onNew: () => void;
}

/** All (selected) + the user's groups + New. A group opens its comparison screen; New is the Pro-gated create. */
export function GroupStrip({ groups, onNew }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <TouchableOpacity
        style={[styles.chip, styles.active]}
        accessibilityState={{ selected: true }}
      >
        <Text style={[styles.text, styles.activeText]}>{t('allAccounts.groups.all')}</Text>
      </TouchableOpacity>
      {groups.map((g) => (
        <TouchableOpacity
          key={g.id}
          style={styles.chip}
          onPress={() =>
            router.push({ pathname: '/all-accounts/group/[id]', params: { id: g.id } })
          }
          accessibilityRole="button"
        >
          <Text style={styles.text}>{g.name}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.chip} onPress={onNew} accessibilityRole="button">
        <Ionicons name="add" size={16} color={theme.colors.primary} />
        <Text style={[styles.text, { color: theme.colors.primary }]}>
          {t('allAccounts.groups.new')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  row: { gap: theme.spacing[2], alignItems: 'center' as const },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  active: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
  text: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  activeText: { color: theme.colors.primary },
});
