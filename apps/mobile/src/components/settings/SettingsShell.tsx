import React, { useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import {
  SETTINGS_FORM_MAX_WIDTH,
  paneContentMaxWidth,
  resolveSettingsPane,
  type SettingsPaneKey,
} from '@/features/settings/settingsRegistry';
import { SettingsNav } from './SettingsNav';
import { SettingsOverviewPane } from './SettingsOverviewPane';
import { SettingsPaneProvider } from './SettingsPaneContext';

interface Props {
  /**
   * The screen this route is for. Absent at `/settings` itself, which shows no
   * selection at all.
   *
   * A key that the registry does not classify as a pane — a link key, a stale
   * bookmark — resolves to nothing and falls back to the no-selection pane.
   * That is what stops the shell from swallowing a place-you-work, and it is
   * why the resolution lives in the registry rather than here.
   */
  selected?: SettingsPaneKey;
  /**
   * The extracted screen, supplied by the route. The shell never imports a
   * settings screen: the selection IS the URL, so the route that renders the
   * shell is always the route for the pane being shown, and there is no map of
   * key → component to keep in step with the registry.
   */
  children?: React.ReactNode;
}

/**
 * The two-pane desktop settings layout: a fixed list of rows on the left, the
 * selected screen on the right.
 *
 * **Web-only by construction, not by a runtime check.** Nothing imports this
 * except a `.web.tsx` file, so Metro's native graph never reaches it — the
 * same split `ExpensesView.web.tsx` uses, and the reason the native bundle
 * grep in this plan's verification expects zero.
 *
 * **One page scroll.** Both panes sit inside this component's single
 * `ScrollView`, exactly as the dashboard's focus column and rail do. Screens
 * put `SettingsScreenScroll` where their own `ScrollView` was, which collapses
 * to a plain `View` in a pane so there is never a second scroller.
 */
export function SettingsShell({ selected, children }: Props) {
  const styles = useStyles(createStyles);
  const isAdmin = useAuthStore((s) => s.user?.isAdmin ?? false);
  const pendingCount = usePurchaseRequestStore((s) => s.pendingCount);
  const loadPendingCount = usePurchaseRequestStore((s) => s.loadPendingCount);

  // The one row that carries live data. The hub loads the same count on mount;
  // without it the desktop left pane would silently drop a badge the phone
  // shows.
  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  const pane = resolveSettingsPane(selected);
  // No selection is treated as a form: the profile card and logout button are
  // a form's worth of content, and one cap rule beats two.
  const maxWidth = pane ? paneContentMaxWidth(pane) : SETTINGS_FORM_MAX_WIDTH;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent}>
        <View style={styles.body}>
          <SettingsNav
            selectedKey={pane?.key}
            isAdmin={isAdmin}
            pendingPurchaseRequests={pendingCount}
          />
          <View style={styles.pane}>
            {/* Left-aligned, never centred: centred content inside a
                left-aligned shell reads adrift. */}
            <View style={[styles.paneContent, maxWidth ? { maxWidth } : null]}>
              <SettingsPaneProvider desktop bottomInset={0}>
                {pane ? children : <SettingsOverviewPane />}
              </SettingsPaneProvider>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    // Every container paints its own ground. Without this the tree is
    // transparent and React Navigation's rgb(242,242,242) default shows
    // through — light grey under dark-theme text.
    backgroundColor: theme.colors.background,
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    flexGrow: 1,
  },
  body: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
  },
  pane: {
    flex: 1,
    minWidth: 0,
    padding: theme.spacing[6],
  },
  paneContent: {
    width: '100%' as const,
  },
});
