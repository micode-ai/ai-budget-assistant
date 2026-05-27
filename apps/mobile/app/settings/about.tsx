import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getLegalUrls } from '@/constants/legal';
import Constants from 'expo-constants';

export default function AboutSettingsScreen() {
  const { t, i18n } = useTranslation();
  const legalUrls = getLegalUrls(i18n.language);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t('settings.version')}</Text>
            <Text style={styles.fieldValue}>{appVersion}</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => router.push('/help' as any)}
          >
            <View style={styles.fieldValueRow}>
              <Ionicons name="help-circle-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.fieldLabel}>{t('help.title')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => Linking.openURL(legalUrls.support)}
          >
            <Text style={styles.fieldLabel}>{t('settings.support')}</Text>
            <Ionicons name="mail-outline" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => Linking.openURL(legalUrls.privacyPolicy)}
          >
            <View style={styles.fieldValueRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.fieldLabel}>{t('legal.privacyPolicy')}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.fieldRow}
            onPress={() => Linking.openURL(legalUrls.termsOfService)}
          >
            <View style={styles.fieldValueRow}>
              <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.fieldLabel}>{t('legal.termsOfService')}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  fieldValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
});
