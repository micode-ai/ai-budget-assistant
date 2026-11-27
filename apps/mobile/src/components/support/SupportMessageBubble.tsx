import React, { memo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SupportMessageView } from '@budget/shared-types';
import { useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { bubbleText } from '@/features/support/supportDisplay';

interface Props {
  message: SupportMessageView;
  autoTranslate: boolean;
  /** Set only on the LAST user message: the "Sent / Read" line under it. */
  status?: 'sent' | 'read' | null;
  /** Show "Usually replies within a day" after the status (the user is waiting for a reply). */
  showReplyHint?: boolean;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(getIntlLocale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/**
 * One message. A developer reply leads with the text `bubbleText` picks
 * (translation or original, per the thread's auto-translate) and always offers
 * the other one tap away — the original is never unreachable. `showAlt` is
 * per bubble and deliberately not persisted.
 */
export const SupportMessageBubble = memo(function SupportMessageBubble({
  message,
  autoTranslate,
  status,
  showReplyHint,
}: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [showAlt, setShowAlt] = useState(false);
  const mine = message.author === 'user';
  const text = bubbleText(message, autoTranslate, showAlt);

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {!mine && <Text style={styles.author}>{t('support.developer')}</Text>}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.body, mine && styles.bodyMine]} selectable>
          {text.primary}
        </Text>
      </View>
      <View style={[styles.metaRow, mine && styles.metaRowMine]}>
        <Text style={styles.meta}>{formatTime(message.createdAt)}</Text>
        {text.altLabelKey && (
          <TouchableOpacity onPress={() => setShowAlt((v) => !v)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.altLink}>{t(text.altLabelKey)}</Text>
          </TouchableOpacity>
        )}
      </View>
      {mine && status && (
        <Text style={[styles.meta, styles.status]}>
          {status === 'read' ? t('support.statusRead') : t('support.statusSent')}
          {showReplyHint ? ` · ${t('support.replyHint')}` : ''}
        </Text>
      )}
    </View>
  );
});

const createStyles = (theme: Theme) => ({
  row: {
    marginVertical: theme.spacing[1],
    maxWidth: '85%' as const,
  },
  rowMine: {
    alignSelf: 'flex-end' as const,
    alignItems: 'flex-end' as const,
  },
  rowTheirs: {
    alignSelf: 'flex-start' as const,
    alignItems: 'flex-start' as const,
  },
  author: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: 2,
    marginLeft: theme.spacing[1],
  },
  bubble: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  bubbleMine: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.borderRadius.sm,
  },
  bubbleTheirs: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.sm,
  },
  body: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  bodyMine: {
    color: theme.colors.textInverse,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: 2,
    marginHorizontal: theme.spacing[1],
  },
  metaRowMine: {
    justifyContent: 'flex-end' as const,
  },
  meta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  altLink: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
  status: {
    marginTop: 2,
    marginHorizontal: theme.spacing[1],
    textAlign: 'right' as const,
  },
});
