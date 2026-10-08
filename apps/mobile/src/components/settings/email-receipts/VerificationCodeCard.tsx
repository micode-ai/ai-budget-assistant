import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * The Gmail forwarding-verification code (ABA-644), shown large with a copy button.
 * Gmail mails it to the private address when the user adds it as a forwarding
 * address; the code lives 24 hours, so it is here when the push was missed.
 */
export function VerificationCodeCard({ code }: { code: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('emailReceipts.verificationTitle')}</Text>
      <Text style={styles.code} selectable>
        {code}
      </Text>
      <Text style={styles.body}>{t('emailReceipts.verificationBody')}</Text>
      <TouchableOpacity style={styles.copy} onPress={copy}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={theme.colors.primary} />
        <Text style={styles.copyText}>{copied ? t('emailReceipts.copied') : t('emailReceipts.copy')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[6],
    alignItems: 'center' as const,
  },
  title: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  code: {
    ...theme.textStyles.display,
    color: theme.colors.textPrimary,
    letterSpacing: 4,
    marginVertical: theme.spacing[3],
    textAlign: 'center' as const,
  },
  body: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, textAlign: 'center' as const },
  copy: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    minHeight: 40,
    marginTop: theme.spacing[2],
  },
  copyText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
});
