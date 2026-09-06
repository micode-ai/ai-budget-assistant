import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { AccountSwitcher } from '@/components/AccountSwitcher';
import { WebSidebar } from '@/components/WebSidebar';
import { TOP_BAR_HEIGHT } from '@/components/webLayout.constants';

/** Active-section title shown next to the brand for the 5 main tabs. */
function sectionTitle(pathname: string, t: (k: string) => string): string {
  if (pathname === '/' || pathname === '/index') return t('nav.dashboard');
  if (pathname.startsWith('/expenses')) return t('nav.expenses');
  if (pathname.startsWith('/budgets')) return t('nav.budgets');
  if (pathname.startsWith('/analytics')) return t('nav.analytics');
  if (pathname.startsWith('/chat')) return t('nav.aiChat');
  return '';
}

/**
 * Width cap for the account control in this bar only.
 *
 * Raised from 180 when the control stopped passing `compact`: it now renders
 * at the full 14px type AND carries the currency symbol as a suffix, so the
 * string it must fit grew twice over. 180 was sized for a name alone at 12px.
 * It is still a cap and not a removal - an arbitrarily long name must truncate
 * rather than push the nav around - but it has to clear
 * `<longest ordinary name> - <symbol>` without an ellipsis (criterion 44 names
 * "Investment"). Generous because this bar has a `flex: 1` spacer and hundreds
 * of pixels going spare at every desktop width, including 1024.
 */
const ACCOUNT_TRIGGER_MAX_WIDTH = 240;

/**
 * Full-width desktop top bar: brand + horizontal nav on the left, global
 * controls on the right. Mounted only by `WebShell` on desktop web, so it
 * replaces the per-screen tab header there and never enters the native graph.
 *
 * ## The right-hand cluster is three tiers, not four equals (Addendum 4)
 *
 * It used to be four identical 34px translucent pills, which is the defect:
 * they are four different KINDS of thing wearing one costume. The account is
 * **scope** - it changes every number on screen; the currency was a **display
 * preference**; alerts is an **inbox**; settings is **navigation**. Only the
 * first is a control whose value the user must READ rather than recognise.
 *
 * - **The account control is the one prominent, labelled element.** It no
 *   longer passes `compact`, so it renders at the full type scale and padding,
 *   visibly a different weight from the two icon buttons beside it.
 * - **Bell and gear stay icon-only pills.** They were never wrong in
 *   themselves, only wrong *relative* to the account control; a bell and a gear
 *   are universally legible and labels would be noise.
 * - **A thin vertical divider** separates the two tiers. It makes the tiering
 *   legible with no new chrome and no new i18n key.
 *
 * **Settings deliberately does not fold into the account menu** - folding a
 * navigation target into a scope selector is a category error, and it is the
 * one control users look for by position.
 *
 * **The standalone currency pill is gone.** The display currency was already
 * inside the account menu, deliberately (`AccountSwitcher` opens its menu even
 * with a single account precisely so that control is reachable), so the bar
 * carried two controls for one preference, one of them unlabelled - the
 * redundancy the design language says to resolve by choosing a leader. A
 * display preference does not belong in a navigation bar; its home is
 * Settings then Profile, and its shortcut is the account menu. Nothing became
 * unreachable. What replaces the indicator is the account trigger's own
 * currency suffix: it now reads `Family - zl`, one control stating both the
 * scope and the currency those numbers are in, which is what the combined pill
 * was built for. Splitting it into two pills was a *mobile tab-header*
 * decision, made where width is scarce; `CurrencyPill` itself is unchanged and
 * both phone call sites still render it.
 */
export function WebTopBar() {
  const theme = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();
  const unreadAlertCount = useAlertStore((s) => s.unreadCount);
  const title = sectionTitle(pathname, t);

  const btn = {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.18)',
  };

  /**
   * The unread badge.
   *
   * Two fixes, both grounded. It was a hardcoded `#E53935`, which breaks the
   * rule that every colour comes from `useTheme()` - `danger` exists. And the
   * reason that matters here is sharper than tidiness: `danger` is
   * deliberately NOT accent-derived, while this bar's ground IS
   * (`deriveAccentColors` returns `primary: accentHex` verbatim), so on a
   * red-family accent the badge is red on red. Taking the token does not fix
   * that.
   *
   * The accent-independent fix is the **2px ring in `theme.colors.primary`** -
   * the bar's own colour, so it reads as a gap and separates the disc from the
   * translucent button it overlaps, whatever the accent is. Measured across
   * all 13 accents: the disc-vs-ground pair is a hue difference with almost no
   * luminance difference (contrast 1.00-1.61), so a ring rather than a colour
   * swap is genuinely what this needs.
   *
   * The box grew 15 to 19px because in React Native a border is drawn INSIDE
   * the box: at 15px a 2px ring would have left an 11px content area, clipping
   * "9+" at its 9px type. The visible disc stays ~15px; only the ring is new,
   * and `top`/`right` shift by the same 2px so the disc sits where it did.
   */
  const badge = {
    position: 'absolute' as const,
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 3,
  };
  // `onSemantic`, never `textInverse`: the fill is a semantic colour, and
  // `textInverse` is accent-derived - on a light accent it resolves dark and
  // would put dark text on the red disc.
  const badgeText = {
    color: theme.colors.onSemantic,
    fontSize: 9,
    fontWeight: '700' as const,
  };

  return (
    <View style={[styles.bar, { height: TOP_BAR_HEIGHT, backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.brand, { color: theme.colors.textInverse, fontFamily: theme.fonts.bold }]}>
        AI Budget
      </Text>
      <WebSidebar orientation="horizontal" />

      <View style={styles.spacer} />

      <View style={styles.controls}>
        {/* Tier 1. No `compact`: that flag is a phone-header type scale, and
            this is the one control here whose value has to be read. `desktop`
            sizes and right-anchors its menu panel and swaps the scrim for a
            non-focusable one - see `AccountSwitcher`. */}
        <AccountSwitcher desktop maxTriggerWidth={ACCOUNT_TRIGGER_MAX_WIDTH} />

        {/* The tier boundary. A hairline, not a chrome element: it says the
            two icons beside it are a different kind of thing from the control
            to its left, and it needs no label in any of the nine locales. */}
        <View
          style={[styles.divider, { backgroundColor: theme.colors.textInverse }]}
          // `aria-hidden`, not the iOS/Android accessibility props: this file
          // only ever renders on web, and `createDOMProps` maps this one to a
          // real DOM attribute. A purely decorative rule should not be an
          // announced node.
          aria-hidden
        />

        {/* Tier 2. Icon-only, unchanged - correct in themselves, and only ever
            wrong relative to the account control. */}
        <TouchableOpacity
          onPress={() => router.push('/alerts')}
          style={btn}
          accessibilityRole="button"
          accessibilityLabel={t('alerts.title')}
        >
          <Ionicons name="notifications-outline" size={20} color={theme.colors.textInverse} />
          {unreadAlertCount > 0 && (
            <View style={badge}>
              <Text style={badgeText}>{unreadAlertCount > 9 ? '9+' : unreadAlertCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={btn}
          accessibilityRole="button"
          accessibilityLabel={t('nav.settings')}
        >
          <Ionicons name="settings-outline" size={20} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  brand: { fontSize: 18 },
  title: { fontSize: 15, marginLeft: 16, opacity: 0.85 },
  spacer: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 1px hairline at low opacity - the colour is applied inline from
  // `textInverse` so it tracks the accent's own on-colour rather than being a
  // literal white that would vanish on a light accent. `marginHorizontal`
  // rides on top of `controls`' 8px gap, so the boundary reads as a boundary
  // rather than as a fifth item in the row.
  divider: { width: 1, height: 20, opacity: 0.35, marginHorizontal: 4 },
});
