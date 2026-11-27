import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';
import { CHAT_COLUMN_MAX_WIDTH } from '@/components/webLayout.constants';
import type { UseSupportThreadReturn } from '@/features/support/useSupportThread';
import { SupportTranscript } from './SupportTranscript';
import { SupportComposer } from './SupportComposer';
import { SupportHeaderMenu } from './SupportHeaderMenu';

interface Props {
  support: UseSupportThreadReturn;
  fromRoute?: string;
}

/**
 * Desktop web (≥1024): the desktop chat screen's reading column — the
 * transcript and the composer row both capped at `CHAT_COLUMN_MAX_WIDTH`
 * (760) and centred, while the list itself spans the pane so its scrollbar
 * stays at the window edge. No rail: there is one conversation.
 * Never rendered on native (only `SupportView.web.tsx` imports it).
 */
export function SupportDesktop({ support, fromRoute }: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(CHAT_COLUMN_MAX_WIDTH, width - theme.spacing[5] * 2);

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <SupportTranscript support={support} columnWidth={columnWidth} />
        <SupportHeaderMenu support={support} />
      </View>
      <SupportComposer support={support} fromRoute={fromRoute} bottomInset={0} columnWidth={columnWidth} />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
  },
});
