import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface ReferenceRow {
  icon: IconName;
  label: string;
  description: string;
  route: string;
}

export default function ReferenceDataScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const rows: ReferenceRow[] = [
    {
      icon: 'pricetags-outline',
      label: t('settingsNav.categories'),
      description: t('settingsNav.categoriesDesc'),
      route: '/settings/categories',
    },
    {
      icon: 'storefront-outline',
      label: t('settingsNav.merchants'),
      description: t('settingsNav.merchantsDesc'),
      route: '/settings/merchants',
    },
    {
      icon: 'pricetag-outline',
      label: t('settingsNav.tags'),
      description: t('settingsNav.tagsDesc'),
      route: '/tags/manage',
    },
    {
      icon: 'folder-outline',
      label: t('settingsNav.projects'),
      description: t('settingsNav.projectsDesc'),
      route: '/projects',
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: theme.spacing[10] + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {rows.map((row, index) => (
            <React.Fragment key={row.route}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(row.route as any)}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name={row.icon} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.rowDescription} numberOfLines={1}>
                    {row.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
              {index < rows.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4] },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  rowContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
    marginRight: theme.spacing[2],
  },
  rowLabel: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  rowDescription: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2] },
});
