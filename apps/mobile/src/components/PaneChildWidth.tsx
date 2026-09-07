import React from 'react';
import { View } from 'react-native';
import { useIsDesktopWeb } from './webLayout.constants';
import { SETTINGS_FORM_MAX_WIDTH } from '@/features/settings/settingsRegistry';

/**
 * Caps a **pane child's** content at the same width its parent pane already
 * caps a `'form'` pane at, and centers it.
 *
 * This is the fix for the defect the desktop design-language doc's section 5h
 * left visible on purpose ("What wave 4 leaves visible — the next thing to
 * fix"): `/account/create`, `/account/join`, `/account/[id]` and
 * `/projects/[id]` are each reached only by a `router.push` from a settings
 * pane (`AccountsSettings.tsx` / `ProjectsSettings.tsx`), so 5h's ruling makes
 * every one of them **a route, not a dialog** — it renders as a full page
 * under `WebShell`'s content area, with no left pane beside it, while the
 * pane it was pushed FROM stops at `SETTINGS_FORM_MAX_WIDTH`. Confirmed on a
 * built bundle at 1920: the widest cards on each of these four screens ran
 * edge to edge.
 *
 * **Centers, unlike `SettingsShell`'s own pane content, which is left-aligned
 * on purpose.** That rule ("centred content inside a left-aligned shell reads
 * adrift") is about a pane sitting beside a visible nav rail — none of these
 * four screens have one; they are standalone full pages with only the
 * full-width `WebTopBar` above them. `WebShell.web.tsx`'s own unauthenticated
 * route column is the one existing precedent for a standalone full page under
 * this shell (`{ width: '100%', maxWidth: 480, alignSelf: 'center' }`), and it
 * centers too — this mirrors it, at the settings-form width instead.
 *
 * **Wraps the content, never a screen's own root.** Wrapping a screen's
 * `SafeAreaView`/`ScrollView` root risks breaking its `flex: 1` chain or its
 * keyboard handling (`KeyboardAwareScreen` merges an Android keyboard-height
 * pad into `contentContainerStyle`, which must stay intact). This instead
 * nests one `View` around the content, exactly where `SettingsShell` nests
 * `paneContent` inside `pane` — a wrapper placed as the ScrollView's child,
 * not a style merged into the ScrollView's own props.
 *
 * **Structurally a passthrough off desktop.** Below `DESKTOP_MIN_WIDTH`, and
 * on every native platform at every width, this renders `children` completely
 * unwrapped — not a `View` with a large `maxWidth` that happens not to bite.
 * The extra node simply does not exist off desktop, so mobile's rendering is
 * unchanged by construction, not by a value that happens to be big enough.
 *
 * Reuses `SETTINGS_FORM_MAX_WIDTH` rather than minting a second number for the
 * same measure — the pane this screen was reached from already caps at that
 * width for exactly this class of content (a single column of fields and
 * cards), and two constants for one measure is how a screen comes to disagree
 * with the pane it belongs to.
 *
 * Not a fit for a screen whose content is a `FlatList`/`SectionList` rather
 * than children of a `ScrollView` — none of the four screens above are, but a
 * future caller with one would need to cap `contentContainerStyle` directly
 * instead of wrapping `children`.
 */
export function PaneChildWidth({ children }: { children: React.ReactNode }) {
  const capStyle = paneChildCapStyle(useIsDesktopWeb());

  if (!capStyle) {
    return <>{children}</>;
  }

  return <View style={capStyle}>{children}</View>;
}

/**
 * Pure half of {@link PaneChildWidth}: the one fact here that can be
 * numerically wrong — the cap's width, and that there is no cap at all off
 * desktop — has a test. Nothing renders a component in this repo's CI.
 */
export function paneChildCapStyle(
  isDesktop: boolean,
): { width: '100%'; maxWidth: number; alignSelf: 'center' } | undefined {
  return isDesktop
    ? { width: '100%', maxWidth: SETTINGS_FORM_MAX_WIDTH, alignSelf: 'center' }
    : undefined;
}
