import React, { useRef, useState } from 'react';
import { ActivityIndicator, Share, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Child, ChildBenefitCoverage, ChildCostSummary } from '@budget/shared-types';
import { SheetDialog } from '@/components/SheetDialog';
import { buildChildSharePayload } from '@/features/children/childShare';
import { playLinkFor } from '@/features/share/shareApp';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ChildShareCard, type ChildShareCardHandle } from './ChildShareCard';

const TITLE_ID = 'child-share-title';

interface Props {
  visible: boolean;
  onClose: () => void;
  child: Child;
  summary: ChildCostSummary;
  coverage: ChildBenefitCoverage | null;
  currency: string;
  year: number;
}

/**
 * The share dialog for one child's card: a preview of exactly what the card
 * says, a "show name" toggle that is OFF every time the dialog opens, and the
 * share action. The image share resolves `false` on web, on a timeout and on a
 * device with no share target; the dialog then falls back to a text share, and
 * when that is unavailable too it says so inline instead of failing silently.
 */
export function ChildShareDialog({ visible, onClose, child, summary, coverage, currency, year }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const cardRef = useRef<ChildShareCardHandle>(null);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const payload = buildChildSharePayload({
    year,
    summary,
    coverage,
    currency,
    name: showName ? child.name : null,
    t,
  });

  const close = () => {
    setShowName(false);
    setFailed(false);
    onClose();
  };

  const onShare = async () => {
    setBusy(true);
    setFailed(false);
    try {
      let ok = false;
      try {
        ok = (await cardRef.current?.share(payload)) ?? false;
      } catch {
        ok = false;
      }
      if (!ok) {
        try {
          await Share.share({
            message: [
              payload.title,
              ...payload.lines.map((l) => `${l.emoji} ${l.label}: ${l.value}`),
              playLinkFor('share-image', 'child'),
            ].join('\n'),
          });
          ok = true;
        } catch (e) {
          // Expected on a browser without the Web Share API.
          console.warn('[children] share unavailable:', e instanceof Error ? e.message : String(e));
        }
      }
      if (ok) close();
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetDialog visible={visible} onClose={close} titleId={TITLE_ID}>
      <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
        {t('childCosts.share.dialogTitle')}
      </Text>

      <View style={styles.preview}>
        <Text style={styles.previewTitle}>{payload.title}</Text>
        {payload.lines.map((l) => (
          <View key={l.label} style={styles.previewRow}>
            <Text style={styles.previewLabel}>{l.label}</Text>
            <Text style={styles.previewValue}>{l.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>{t('childCosts.share.showName')}</Text>
        <Switch
          value={showName}
          onValueChange={setShowName}
          accessibilityLabel={t('childCosts.share.showName')}
          trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
        />
      </View>

      {failed && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {t('childCosts.share.failed')}
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={close} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={onShare}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.primaryText}>{t('childCosts.share.share')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ChildShareCard ref={cardRef} />
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  preview: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  previewTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  previewRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
  },
  previewLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  previewValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums' as const],
  },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: theme.spacing[4],
    gap: theme.spacing[3],
  },
  toggleLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  error: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    marginTop: theme.spacing[3],
  },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[5],
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    minWidth: 120,
    alignItems: 'center' as const,
  },
  primaryText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
  secondaryButton: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  disabled: { opacity: 0.6 },
});
