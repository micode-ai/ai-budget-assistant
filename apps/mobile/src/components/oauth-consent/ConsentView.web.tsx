import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useIsDesktopWeb } from '../webLayout.constants';
import { useConsent } from '@/features/oauth-consent/useConsent';
import type { RawSearchParams } from '@/features/oauth-consent/consentParams';
import { ConsentPhone } from './ConsentPhone';
import { ConsentDesktop } from './ConsentDesktop';

/** True when this document is inside a frame (or the check itself is blocked, which only a frame does). */
function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * Web: refuses to render inside a frame, then decides on width alone — the desktop card at 1024
 * and above, the phone layout below.
 *
 * The frame check is defence in depth beside nginx's `frame-ancestors 'none'` on `/authorize`:
 * that header covers only a document LOADED at `/authorize`, while this SPA can also reach the
 * route client-side (a framed `/login` that comes back here after sign-in), where no new response
 * — and so no header — is involved. A framed consent page is a clickjacking target, so it shows a
 * notice and never calls the server.
 */
export function ConsentView({ params }: { params: RawSearchParams }) {
  const [framed] = useState(isFramed);
  if (framed) return <FramedNotice />;
  return <ConsentWeb params={params} />;
}

/**
 * The hook runs HERE, once, and its state is passed down — so a resize across 1024 swaps the
 * layout without re-running the preview or losing the selected account (the `ChatView.web.tsx`
 * rule).
 */
function ConsentWeb({ params }: { params: RawSearchParams }) {
  const consent = useConsent(params);
  return useIsDesktopWeb() ? <ConsentDesktop consent={consent} /> : <ConsentPhone consent={consent} />;
}

function FramedNotice() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.centered}>
      <Ionicons name="lock-closed-outline" size={40} color={theme.colors.textSecondary} />
      <Text style={styles.text}>{t('oauthConsent.framed')}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[4],
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background,
  },
  text: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    maxWidth: 480,
  },
});
