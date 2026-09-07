import React from 'react';
import {
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingScreen } from '@/components/KeyboardAvoidingScreen';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { sheetBottomPadding } from '@/components/sheetDialog.geometry';
import { useTheme, useStyles, type Theme } from '@/theme';

/** The desktop panel's width cap. One number, not a prop: a dialog that is a
 *  different width on every screen is what a shared chrome exists to prevent,
 *  and every hand-written desktop panel in this tree already chose 480. */
const DESKTOP_PANEL_MAX_WIDTH = 480;

export interface SheetDialogProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;

  /**
   * Mobile only: lift the sheet by the keyboard height. Pass `true` for any
   * sheet containing a `TextInput` — without it, entering a name in a sheet
   * whose field sits below the keyboard is impossible, and no desktop check
   * would ever catch that.
   */
  keyboardAvoiding?: boolean;

  /**
   * Mobile only: whether a tap on the scrim closes the sheet. Defaults to
   * `true`; the colour picker passes `false`, whose backdrop is inert today.
   * The DESKTOP scrim closes on an outside click, as every other desktop
   * dialog in this app does, and `Esc` closes both branches via
   * `onRequestClose` — **unless `dismissable` (below) is `false`, which turns
   * both of those off regardless of this prop.**
   */
  dismissOnScrimPress?: boolean;

  /**
   * Whether the dialog can be closed by anything other than an explicit call
   * to `onClose` from inside `children`. Defaults to `true`. `false` turns off
   * `onRequestClose` on BOTH branches' underlying `Modal` (Esc on web, the
   * Android hardware back button, the Apple TV menu button) and the desktop
   * scrim's outside-click close — the same two paths, because both exist to
   * let a user back out without deciding, which is exactly what a dialog
   * showing an unrecoverable secret must not offer.
   *
   * **It does not touch `dismissOnScrimPress`.** That prop is mobile-only and
   * governs a different element (the mobile scrim), so the two are
   * independent: a call site whose mobile scrim already does nothing on tap
   * (`dismissOnScrimPress={false}`, rendering a plain `View` instead of a
   * `TouchableOpacity`) needs BOTH props to get a dialog with exactly one
   * exit on every surface — passing `dismissable={false}` alone still leaves
   * a tappable mobile scrim standing, if `dismissOnScrimPress` defaults or is
   * set to `true`.
   *
   * Reach for this only when the content cannot be recovered once the dialog
   * closes (a one-time key shown exactly once, not a form the user can
   * reopen) and the dialog already has its own explicit, deliberate way out.
   * It trades away the escape hatches a keyboard or screen-reader user
   * reaches for first, for the one property that matters more here: the
   * secret cannot be dismissed away by accident.
   */
  dismissable?: boolean;

  /** Mobile only: Android `statusBarTranslucent` on the underlying `Modal`. */
  statusBarTranslucent?: boolean;

  /**
   * `nativeID` of the element naming this dialog, wired to `aria-labelledby`
   * on the desktop branch. Ignored on mobile, where the platform derives the
   * name from the content.
   */
  titleId?: string;

  /** See `sheetDialog.geometry.ts`. A new sheet should pass neither. */
  padBottom?: number;
  insetFloor?: number;

  /**
   * Mobile-only deviations from the canonical sheet box, and the mobile scrim
   * colour. They exist for the sheets that predate this wrapper and whose
   * phone pixels may not move — normalising those would change the rendering
   * on the released product, which outranks tidiness. **A new sheet should
   * pass none of the three** and take the canonical, themed defaults.
   */
  sheetStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  scrimColor?: string;

  /**
   * Desktop only: wrap `children` in the panel's own scroller. Defaults to
   * `true`. Pass `false` when the content already contains a `ScrollView` — a
   * second scroller inside the dialog is the "one scroller too many" the
   * design language forbids, and on web a nested one collapses quietly.
   */
  desktopScroll?: boolean;

  /** Desktop only: extra style on the panel's content container (e.g. a `gap`
   *  the mobile sheet gets from its own padding). */
  desktopContentStyle?: StyleProp<ViewStyle>;
}

/**
 * One sheet, two chromes: a bottom sheet on a phone, a centred dialog on
 * desktop web.
 *
 * **Why this exists at all.** On react-native-web a `Modal` is a fixed
 * full-viewport overlay regardless of what opened it, so a sheet opened from
 * inside a settings pane slid up 1920px wide from the bottom of the window —
 * covering the very list the user was editing, a long pointer journey from the
 * control that opened it. Anchoring a sheet to the pane instead was rejected:
 * it means either hand-rolling an overlay (giving up `role="dialog"`,
 * `aria-modal`, `Esc`, the focus trap and focus restoration, none of which may
 * be hand-rolled) or portal work — a new mechanism for less benefit — and it
 * is worse at 1200px, where the pane is ~700px and a pane-anchored dialog is
 * cramped exactly where a centred one is unaffected.
 *
 * **But the strongest reason is not the desktop look.** Eight sheets have
 * already needed the same hand-copied `paddingBottom + insets.bottom` fix
 * (ABA-483), because the app is edge-to-edge and a bottom-anchored sheet's
 * last row otherwise lands under the system navigation bar — untappable, not
 * merely clipped. This wrapper owns that composition in one place (see
 * `sheetDialog.geometry.ts`, which is where the arithmetic is tested), so the
 * ninth sheet cannot reintroduce it by forgetting.
 *
 * **It decides with `useIsDesktopWeb()`, not a `desktop?` prop.** §5a's
 * runtime flag is right for a shared *section* whose parent already knows
 * which layout it is drawing. Here every call site would pass the same value,
 * derived from the same width, and a prop that must be remembered at ten call
 * sites is one that will be forgotten at one — silently, since a forgotten
 * `desktop` renders a working sheet in the wrong place rather than failing.
 *
 * **One file, not a `.web.tsx` split.** §5f's rule that "a raw `<div>` earns a
 * file split" is about a component that renders on one platform only, where an
 * extensionless no-op lets the bundler enforce what a chain of reasoning
 * otherwise has to. This one must render on native — the phone's sheet IS one
 * of its two branches — so a no-op half is impossible. The `<div>` sits behind
 * `useIsDesktopWeb()`, whose first term is `Platform.OS === 'web'`: a one-link
 * chain, and the same one its four in-tree predecessors already ship with
 * (`SafeToSpendSheet`, `FinancialHealthWidget`, `InflationIndexSection`,
 * `AccountSwitcher`).
 *
 * **The scrim differs by branch, deliberately.** On desktop it is a raw
 * `<div>` with no `tabindex` — react-native-web gives every `Pressable` /
 * `TouchableOpacity` a `tabIndex` attribute, and ANY tabindex makes an element
 * a valid `.focus()` target, so a touchable scrim becomes the focus trap's
 * first, invisible target and `Enter` on it discards whatever was typed. See
 * `ExpenseDialog.tsx` for the full reading of react-native-web's source. On
 * the mobile branch the scrim stays a `TouchableOpacity`, byte for byte what
 * the seven sheets ship today; that leaves the same focus-trap quirk in place
 * for a keyboard user on web BELOW 1024px, which is a pre-existing property of
 * the mobile rendering and not something to change here.
 */
export function SheetDialog({
  visible,
  onClose,
  children,
  keyboardAvoiding = false,
  dismissOnScrimPress = true,
  dismissable = true,
  statusBarTranslucent,
  titleId,
  padBottom,
  insetFloor,
  sheetStyle,
  handleStyle,
  scrimColor,
  desktopScroll = true,
  desktopContentStyle,
}: SheetDialogProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();

  if (isDesktop) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={dismissable ? onClose : undefined}
        aria-labelledby={titleId}
      >
        {/* Deliberately a raw <div>: it must carry no tabindex at all. See the
            file-level comment, and `ExpenseDialog.tsx` for the source reading. */}
        <div
          role="presentation"
          onClick={(e) => {
            if (dismissable && e.target === e.currentTarget) onClose();
          }}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.overlay,
            padding: 24,
          }}
        >
          <View style={styles.panel}>
            {desktopScroll ? (
              <ScrollView
                style={styles.panelBody}
                contentContainerStyle={[styles.panelBodyContent, desktopContentStyle]}
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </div>
      </Modal>
    );
  }

  const scrimStyle = [styles.scrim, scrimColor ? { backgroundColor: scrimColor } : null];

  const body = (
    <>
      {dismissOnScrimPress ? (
        <TouchableOpacity style={scrimStyle} activeOpacity={1} onPress={onClose} />
      ) : (
        <View style={scrimStyle} />
      )}
      <View
        style={[
          styles.sheet,
          sheetStyle,
          { paddingBottom: sheetBottomPadding(insets.bottom, { padBottom, insetFloor }) },
        ]}
      >
        <View style={[styles.handle, handleStyle]} />
        {children}
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent={statusBarTranslucent}
      animationType="slide"
      onRequestClose={dismissable ? onClose : undefined}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingScreen style={styles.overlay}>{body}</KeyboardAvoidingScreen>
      ) : (
        <View style={styles.overlay}>{body}</View>
      )}
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  // Mobile: the sheet is bottom-anchored, the scrim takes the rest.
  overlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  scrim: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    // Longhands, not `padding`, even though the two are equivalent here: a
    // call site's `sheetStyle` override then competes key-for-key instead of
    // relying on shorthand-versus-longhand precedence, which RN and
    // react-native-web resolve by rules that differ from CSS source order.
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[6],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  // Desktop: a centred panel, mirroring every other dialog on this surface.
  panel: {
    width: '90%' as const,
    maxWidth: DESKTOP_PANEL_MAX_WIDTH,
    maxHeight: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  panelBody: {
    flexShrink: 1,
  },
  panelBodyContent: {
    padding: theme.spacing[5],
  },
});
