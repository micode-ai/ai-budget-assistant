import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useTheme, useStyles, type Theme } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface SecondaryOption {
  icon: IconName;
  labelKey: string;
  hintKey?: string;
  route: string;
}

const SECONDARY_OPTIONS: SecondaryOption[] = [
  { icon: 'mic-outline', labelKey: 'onboarding.useVoice', route: '/expense/voice' },
  { icon: 'create-outline', labelKey: 'onboarding.typeManually', route: '/expense/new' },
  {
    icon: 'cloud-download-outline',
    labelKey: 'onboarding.bringHistory',
    hintKey: 'onboarding.bringHistoryHint',
    route: '/settings/import',
  },
];

export default function GetStartedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { next } = useLocalSearchParams<{ next?: string }>();
  const markSeen = useFirstRunStore((s) => s.markSeen);

  const expenseCount = useExpenseStore((s) => s.expenses.length);
  const incomeCount = useIncomeStore((s) => s.incomes.length);
  const startedEmpty = useRef(expenseCount + incomeCount === 0);

  // Where the user goes when onboarding is done — after an action or a skip.
  // `next=welcome` is passed only by the email-verification path, which is the
  // one that used to land on the pricing screen. Google sign-in passes nothing
  // and therefore keeps going straight to the tabs, exactly as it does today:
  // this feature must not start showing pricing to an audience that never saw it.
  const finish = () => {
    markSeen();
    router.replace(next === 'welcome' ? '/welcome' : '/(tabs)');
  };

  useEffect(() => {
    if (startedEmpty.current && expenseCount + incomeCount > 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseCount, incomeCount]);

  const goTo = (route: string) => {
    markSeen();
    router.push(route as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="rocket-outline" size={40} color={theme.colors.primary} />
          </View>
          <Text style={styles.heading}>{t('onboarding.heading')}</Text>
          <Text style={styles.subheading}>{t('onboarding.subheading')}</Text>
        </View>

        {/* Primary option — scan a receipt */}
        <TouchableOpacity
          style={styles.primaryCard}
          onPress={() => goTo('/expense/receipt')}
          activeOpacity={0.85}
        >
          <View style={styles.primaryIconContainer}>
            <Ionicons name="receipt-outline" size={26} color={theme.colors.textInverse} />
          </View>
          <View style={styles.primaryContent}>
            <Text style={styles.primaryLabel}>{t('onboarding.scanReceipt')}</Text>
            <Text style={styles.primaryHint}>{t('onboarding.scanReceiptHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textInverse} />
        </TouchableOpacity>

        {/* Secondary options */}
        <View style={styles.card}>
          {SECONDARY_OPTIONS.map((option, index) => (
            <React.Fragment key={option.route}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => goTo(option.route)}
                activeOpacity={0.7}
              >
                <View style={styles.rowIconContainer}>
                  <Ionicons name={option.icon} size={20} color={theme.colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{t(option.labelKey)}</Text>
                  {option.hintKey && (
                    <Text style={styles.rowDescription} numberOfLines={1}>
                      {t(option.hintKey)}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
              {index < SECONDARY_OPTIONS.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Skip for now */}
        <TouchableOpacity style={styles.laterLink} onPress={finish}>
          <Text style={styles.laterText}>{t('onboarding.later')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },

  // Header
  header: {
    alignItems: 'center' as const,
    marginBottom: 28,
    paddingTop: 12,
  },
  headerIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  heading: {
    fontSize: 26,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center' as const,
  },
  subheading: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },

  // Primary card
  primaryCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[3],
  },
  primaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primaryContent: {
    flex: 1,
  },
  primaryLabel: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  primaryHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textInverse,
    opacity: 0.85,
    marginTop: 2,
  },

  // Secondary options card
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[5],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  rowIconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  rowContent: {
    flex: 1,
    marginLeft: theme.spacing[3],
    marginRight: theme.spacing[2],
  },
  rowLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  rowDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },

  // Later link
  laterLink: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  laterText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline' as const,
  },
});
