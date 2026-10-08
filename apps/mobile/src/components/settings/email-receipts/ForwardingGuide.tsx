import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

type Provider = 'gmail' | 'outlook';

const STEPS: Record<Provider, readonly string[]> = {
  gmail: ['guideGmailStep1', 'guideGmailStep2', 'guideGmailStep3'],
  outlook: ['guideOutlookStep1', 'guideOutlookStep2'],
};

const NOTES: Record<Provider, string> = {
  gmail: 'guideGmailTip',
  outlook: 'guideOutlookNote',
};

/**
 * The Gmail / Outlook auto-forward guide (ABA-644) as an accordion. It deliberately
 * never recommends forwarding all mail - the Gmail steps end in a filter - both for
 * privacy and because every forwarded message can cost an AI request.
 */
export function ForwardingGuide() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState<Provider | null>(null);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('emailReceipts.guideTitle')}</Text>
      <View style={styles.card}>
        {(['gmail', 'outlook'] as const).map((provider, index) => {
          const expanded = open === provider;
          return (
            <View key={provider}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.header}
                onPress={() => setOpen(expanded ? null : provider)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <Text style={styles.headerText}>
                  {t(provider === 'gmail' ? 'emailReceipts.guideGmail' : 'emailReceipts.guideOutlook')}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
              {expanded && (
                <View style={styles.body}>
                  {STEPS[provider].map((key, i) => (
                    <Text key={key} style={styles.step}>
                      {i + 1}. {t(`emailReceipts.${key}`)}
                    </Text>
                  ))}
                  <Text style={styles.note}>{t(`emailReceipts.${NOTES[provider]}`)}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: { marginBottom: theme.spacing[6] },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: 40,
  },
  headerText: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  body: { paddingTop: theme.spacing[2], gap: theme.spacing[2] },
  step: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  note: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: theme.spacing[1] },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: theme.spacing[2] },
});
