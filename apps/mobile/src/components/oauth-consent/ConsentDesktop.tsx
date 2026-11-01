import React from 'react';
import { ScrollView, View } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import type { ConsentState } from '@/features/oauth-consent/useConsent';
import { ConsentBody } from './ConsentBody';

/** The consent card's width on desktop web — the same 480 column as the signed-out auth screens. */
export const CONSENT_CARD_WIDTH = 480;

/**
 * Desktop web (>=1024): a centred 480px card on the page background, Deny and Allow side by side.
 * Web-only — imported by `ConsentView.web.tsx` alone, so it never reaches the native bundle.
 */
export function ConsentDesktop({ consent }: { consent: ConsentState }) {
  const styles = useStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <ConsentBody consent={consent} desktop />
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[5],
  },
  card: {
    width: '100%' as const,
    maxWidth: CONSENT_CARD_WIDTH,
    padding: theme.spacing[8],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.md,
  },
});
