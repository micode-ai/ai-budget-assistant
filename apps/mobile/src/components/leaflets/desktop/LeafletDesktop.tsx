import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { LeafletSource } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import i18n from '@/i18n';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { CONTENT_MAX_WIDTH, FACET_RAIL_MIN_WIDTH } from '@/components/webLayout.constants';
import { leafletTitle, leafletValidUntil, progressLabel } from '@/features/leaflets/leafletDisplay';
import type { LeafletInputFile } from '@/features/leaflets/leafletPages';
import type { LeafletSession } from '@/features/leaflets/useLeafletSession';
import { LEAFLET_DESKTOP_COLUMNS as COL, LeafletMatchRow } from '../LeafletMatchRow';
import { LeafletErrorState, LeafletNoticeBanners } from '../LeafletNotices';
import { LeafletActiveList, LeafletBackToList } from '../LeafletActiveList';

const RAIL_WIDTH = 300;

/** Files from a browser drop, as object URLs the reader can fetch. `useLeafletSession` revokes them. */
function droppedFiles(list: FileList): LeafletInputFile[] {
  return Array.from(list).map((f) => ({
    uri: URL.createObjectURL(f),
    mimeType: f.type || (f.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : ''),
    size: f.size,
  }));
}

const sourceFor = (files: LeafletInputFile[]): LeafletSource =>
  files.length > 0 && files.every((f) => f.mimeType === 'application/pdf') ? 'pdf' : 'upload';

/**
 * Desktop leaflet screen (>=1024, task-5-desktop-spec). Idle: the drop zone fills the content
 * area. Reading or done: one dense table column of offers, the zone shrinking into a 300px rail
 * (>=1440) or a one-line strip above the table (1024-1439). The whole page is the drop target; the
 * zone only shows it. One page scroll, no inner scrollers, no shortcut and no Esc binding. Below
 * the idle zone, the account's active leaflets, each of which reopens with its rows (R13).
 */
export function LeafletDesktop({ session }: { session: LeafletSession }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const railBeside = width >= FACET_RAIL_MIN_WIDTH;
  const { reader, budget, addedIds, addToList, pickFiles, readFiles, retry, active, openLeaflet, closeLeaflet } = session;
  const { result, reading, error, progress } = reader;

  const [dragOver, setDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hover = { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) };
  const rootRef = useRef<View>(null);

  const budgetLeft = budget ? Math.max(0, budget.limit - budget.used) : null;
  const exhausted = budgetLeft === 0;
  const budgetLine =
    budget && budgetLeft !== null
      ? exhausted
        ? t('leaflets.budgetExhausted')
        : t('leaflets.budgetLeft', { left: budgetLeft, limit: budget.limit })
      : null;

  const openPaywall = () => useUpgradeStore.getState().show(i18n.t('leaflets.limitBody'), 'pro');

  const choose = () => {
    if (reading) return;
    if (exhausted) {
      openPaywall();
      return;
    }
    void pickFiles();
  };

  const onDropFiles = useCallback(
    (list: FileList) => {
      if (reading || list.length === 0) return;
      if (exhausted) {
        openPaywall();
        return;
      }
      // The session owns the object URLs (it revokes them on the next run and on leaving), so a
      // resize below 1024 mid-read unmounts this body without breaking the read or Retry.
      const files = droppedFiles(list);
      readFiles(files, sourceFor(files));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reading, exhausted, readFiles],
  );

  // React Native Web's View does not forward drag events, so listen on the DOM node itself.
  useEffect(() => {
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return undefined;
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (e.target === node || !node.contains(e.relatedTarget as Node | null)) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files) onDropFiles(e.dataTransfer.files);
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [onDropFiles]);


  const zoneLabel = dragOver ? t('leaflets.dropActive') : exhausted ? t('leaflets.budgetExhausted') : t('leaflets.dropTitle');

  // One root for every state, so the drop listeners stay on the same DOM node.
  const page = (content: React.ReactNode, idle = false) => (
    <View ref={rootRef} style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.page}>
        <View style={[styles.inner, idle && styles.idleInner]}>{content}</View>
      </ScrollView>
    </View>
  );

  if (error) return page(<LeafletErrorState error={error} onRetry={retry} />);

  // Idle: the zone IS the page.
  if (!result && !reading) {
    return page(
      <>
            <LeafletNoticeBanners reader={reader} />
            <Pressable
              onPress={choose}
              accessibilityRole="button"
              accessibilityLabel={t('leaflets.chooseFiles')}
              {...hover}
              style={[
                styles.zone,
                styles.zoneLarge,
                (dragOver || hovered) && styles.zoneActive,
              ]}
            >
              <Ionicons
                name={exhausted ? 'lock-closed-outline' : 'cloud-upload-outline'}
                size={48}
                color={dragOver ? theme.colors.primary : theme.colors.textTertiary}
              />
              <Text style={styles.zoneTitle}>{zoneLabel}</Text>
              <Text style={styles.zoneHint}>{t('leaflets.dropHint')}</Text>
              <View style={styles.chooseButton}>
                <Text style={styles.chooseButtonText}>{t('leaflets.chooseFiles')}</Text>
              </View>
            </Pressable>
            {budgetLine && <Text style={styles.muted}>{budgetLine}</Text>}
            <LeafletActiveList leaflets={active} onOpen={(id) => void openLeaflet(id)} desktop />
      </>,
      true,
    );
  }

  const matches = result?.matches ?? [];
  const validUntil = leafletValidUntil(result);

  const compactZone = (
    <Pressable
      onPress={choose}
      disabled={reading}
      accessibilityRole="button"
      accessibilityLabel={t('leaflets.chooseFiles')}
      {...hover}
      style={[
        styles.zone,
        railBeside ? styles.zoneRail : styles.zoneStrip,
        (dragOver || (hovered && !reading)) && styles.zoneActive,
        reading && styles.zoneDisabled,
      ]}
    >
      <Ionicons
        name={exhausted ? 'lock-closed-outline' : 'cloud-upload-outline'}
        size={railBeside ? 28 : 18}
        color={dragOver ? theme.colors.primary : theme.colors.textTertiary}
      />
      <Text style={styles.zoneCompactText} numberOfLines={railBeside ? 2 : 1}>
        {dragOver ? t('leaflets.dropActive') : t('leaflets.readAnother')}
      </Text>
      {!railBeside && budgetLine && <Text style={[styles.muted, styles.stripBudget]}>{budgetLine}</Text>}
    </Pressable>
  );

  const table = (
    <View style={styles.mainColumn}>
      {!reading && (active?.length ?? 0) > 0 && <LeafletBackToList onPress={closeLeaflet} />}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.title} numberOfLines={1}>
            {[leafletTitle(result), validUntil].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.muted}>{t('leaflets.matchCount', { count: matches.length })}</Text>
        </View>
        {reading && (
          <View accessibilityLiveRegion="polite" style={styles.progress}>
            <Text style={styles.muted}>{progressLabel(progress)}</Text>
            {progress.total > 0 && (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(progress.done / progress.total) * 100}%` }]} />
              </View>
            )}
          </View>
        )}
        <View style={styles.bannerWrap}>
          <LeafletNoticeBanners reader={reader} />
        </View>
        {matches.length > 0 && (
          <View style={styles.colRow}>
            <View style={styles.colName}>
              <Text style={styles.colText}>{t('leaflets.colProduct')}</Text>
            </View>
            <View style={styles.colPromo}>
              <Text style={[styles.colText, styles.right]}>{t('leaflets.colPromo')}</Text>
            </View>
            <View style={styles.colUsually}>
              <Text style={styles.colText}>{t('leaflets.colUsually')}</Text>
            </View>
            <View style={styles.colCondition}>
              <Text style={styles.colText}>{t('leaflets.colCondition')}</Text>
            </View>
            <View style={styles.colAction} />
          </View>
        )}
        {matches.map((m) => (
          <LeafletMatchRow key={m.itemId} match={m} added={addedIds.has(m.itemId)} onAdd={addToList} desktop />
        ))}
        {!reading && matches.length === 0 && <Text style={styles.empty}>{t('leaflets.empty')}</Text>}
      </View>
      <Text style={styles.footnote}>{t('leaflets.footnote')}</Text>
    </View>
  );

  return page(
    railBeside ? (
      <View style={styles.body}>
        {table}
        <View style={styles.rail}>
          {compactZone}
          {budgetLine && <Text style={styles.muted}>{budgetLine}</Text>}
          <Text style={styles.footnote}>{t('leaflets.footnote')}</Text>
        </View>
      </View>
    ) : (
      <View style={styles.stacked}>
        {compactZone}
        {table}
      </View>
    ),
  );
}

const createStyles = (theme: Theme) => ({
  // Paints its own ground: React Navigation's default grey would show through in dark mode.
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  page: {
    flexGrow: 1,
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  inner: {
    width: '100%' as const,
    maxWidth: CONTENT_MAX_WIDTH + RAIL_WIDTH,
    alignSelf: 'center' as const,
    flexGrow: 1,
  },
  idleInner: {
    maxWidth: CONTENT_MAX_WIDTH,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
  },
  body: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[4],
  },
  stacked: {
    gap: theme.spacing[3],
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[2],
  },
  rail: {
    width: RAIL_WIDTH,
    gap: theme.spacing[3],
  },
  zone: {
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
  },
  zoneLarge: {
    minHeight: 360,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[8],
  },
  zoneRail: {
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    padding: theme.spacing[5],
  },
  zoneStrip: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  zoneActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  zoneDisabled: {
    opacity: 0.6,
  },
  zoneTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  zoneHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  zoneCompactText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  stripBudget: {
    marginLeft: 'auto' as const,
  },
  chooseButton: {
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  chooseButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
  },
  table: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: theme.spacing[1],
  },
  tableHeader: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  progress: {
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[1.5],
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.progressTrack,
    overflow: 'hidden' as const,
  },
  fill: {
    height: 4,
    backgroundColor: theme.colors.primary,
  },
  bannerWrap: {
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  colRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    // Sticks to the top of the ONE page scroll. Web-only.
    position: 'sticky' as unknown as 'absolute',
    top: 0,
    zIndex: 2,
    backgroundColor: theme.colors.surface,
  },
  colText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  right: {
    textAlign: 'right' as const,
  },
  colName: { flex: 1, minWidth: 140, paddingRight: theme.spacing[2] },
  colPromo: { width: COL.promo, paddingRight: theme.spacing[3] },
  colUsually: { width: COL.usually, paddingRight: theme.spacing[2] },
  colCondition: { width: COL.condition, paddingRight: theme.spacing[2] },
  colAction: { width: COL.action },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    padding: theme.spacing[6],
  },
  footnote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  muted: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
