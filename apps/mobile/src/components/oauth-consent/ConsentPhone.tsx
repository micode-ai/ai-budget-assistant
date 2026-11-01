import React from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles, type Theme } from '@/theme';
import type { ConsentState } from '@/features/oauth-consent/useConsent';
import { ConsentBody } from './ConsentBody';

const PAD = 20;

/** Phone layout (native and narrow web): one scrolling column, Allow above Deny. */
export function ConsentPhone({ consent }: { consent: ConsentState }) {
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: PAD + insets.bottom }]}>
      <ConsentBody consent={consent} desktop={false} />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingTop: PAD,
    paddingHorizontal: PAD,
  },
});
