import { useState } from 'react';
import { View, Text, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SetupChecklist } from '@/components/home/SetupChecklist';
import {
  ROUTE_EXPENSE_NEW,
  ROUTE_IMPORT,
  ROUTE_RECEIPT,
  ROUTE_VOICE,
} from '@/features/dashboard/dashboardDialogs';
import {
  entryCardBasis,
  isChecklistBand,
  resolveEntryRowRegime,
  type EntryRowRegime,
} from '@/features/onboarding/firstRunLayout';
import type { SetupStep } from '@/features/onboarding/resolveSetupSteps';

type IconName = keyof typeof Ionicons.glyphMap;

interface EntryCard {
  icon: IconName;
  labelKey: string;
  hintKey?: string;
  route: string;
}

/**
 * The primary action, alone and full width.
 *
 * **"Bring your history" is primary as a decision, not as an inheritance.** It
 * is the only one of the four that is *easier* here than on a phone — the bank
 * export is on this machine, the camera and the microphone are not — and the
 * only one that turns all nine dashboard cards into real numbers in a single
 * step. The phone leads with "Scan a receipt" for the mirror-image reason, and
 * `app/get-started.tsx` keeps that opposite order untouched. The two platforms
 * disagree on purpose.
 *
 * It became full width because a filled tile inside a 2x2 grid does not read
 * as primary at all — it reads as one of four, coloured differently.
 */
const PRIMARY_CARD: EntryCard = {
  icon: 'cloud-download-outline',
  labelKey: 'onboarding.bringHistory',
  hintKey: 'onboarding.bringHistoryHint',
  route: ROUTE_IMPORT,
};

/**
 * The other three, in one row directly beneath the primary.
 *
 * Their placement is a structural mitigation, not decoration: a user with no
 * export to hand must not hit a dead end, so the alternatives are in the same
 * view rather than behind anything. Voice is last because dictating at a desk
 * is the least natural of the four — it is not removed.
 *
 * **All three open over the dashboard rather than replacing it.** Every route
 * named here still exists and the phone still pushes it; on desktop
 * `resolveEntryAction` redirects these three to a dialog, because this panel's
 * own thesis is that navigating away IS the user leaving — which is exactly
 * what it exists to prevent. The routes are still named (not replaced by dialog
 * ids) so the table keeps pointing at a real, registered destination and the
 * redirection stays one table in one testable module.
 */
const SECONDARY_CARDS: EntryCard[] = [
  {
    icon: 'receipt-outline',
    labelKey: 'onboarding.scanReceipt',
    hintKey: 'onboarding.scanReceiptHint',
    route: ROUTE_RECEIPT,
  },
  { icon: 'create-outline', labelKey: 'onboarding.typeManually', route: ROUTE_EXPENSE_NEW },
  { icon: 'mic-outline', labelKey: 'onboarding.useVoice', route: ROUTE_VOICE },
];

interface FirstRunPanelProps {
  /** The skip link — marks `seen` and reveals the ordinary dashboard. */
  onSkip: () => void;
  /** All three, from `resolveSetupSteps`. Rendered as the band. */
  setupSteps: SetupStep[];
  /**
   * Open an entry's destination — a dialog over the dashboard where one
   * exists, a navigation otherwise. Takes the ROUTE, so the decision stays in
   * `resolveDialogAction`'s single table rather than being re-made here.
   *
   * Owned by `DashboardDesktop`, not here, for one load-bearing reason: this
   * panel UNMOUNTS the moment the first transaction lands (that is the whole
   * exit condition), so a dialog rendered as its child would vanish
   * mid-interaction — taking away the "Scan another"/"Done" choice at the
   * exact moment the user earned it. Mounted a level up, the dialog outlives
   * the panel it was opened from and the user watches the dashboard come
   * alive behind it.
   */
  onOpenRoute: (route: string) => void;
}

/**
 * The desktop dashboard's first-run state: ONE composition across the full
 * content width, top-aligned, five blocks — heading + subheading, the
 * full-width primary card, a row of three, the setup checklist as a
 * full-width band, and the skip link.
 *
 * **It deliberately does NOT use the focus/rail split.** The earlier version
 * did, on the argument that "the layout the user learns is the layout they
 * will use". That was reversed against a deployed build at 1920x855: all
 * content sat in the top ~290px and the screen showed roughly 500px of empty
 * page below it and ~600px of empty rail beside it, holding one small
 * checklist card. The emptiness was geometric, not a content shortage — and
 * an empty rail teaches nothing, because the rail is a container for
 * user-configurable widgets and a user with no data has no widgets. One
 * cause, one fix.
 *
 * **Nothing is added to fill the space.** No preview of the populated
 * dashboard, no worked example with fake figures, no feature list. In an app
 * whose subject is not stating a number it does not have, inventing money on
 * the first screen is the one thing that cannot be done — and a preview
 * without numbers is grey boxes, which is the reported symptom rather than
 * its cure. The space is filled by fixing the geometry and letting the
 * subject occupy it.
 *
 * **Never vertically centred.** `justifyContent: 'center'` looks right on a
 * tall window and pushes the skip link off-screen on a short one while
 * leaving air above the heading. Top-aligned, sized by content.
 *
 * **Tapping a card does NOT mark `seen`.** `get-started.tsx` does, because it
 * is a screen the user navigates away from; this is the dashboard itself, and
 * a user who opens the receipt scanner, changes their mind and comes back
 * must find the invitation still here rather than the empty cards it exists
 * to replace. The state ends on evidence (a transaction landed) or on an
 * explicit skip — see `useWebFirstRun`.
 *
 * Web-only: reached solely from `DashboardDesktop`, which
 * `DashboardView.web.tsx` alone renders.
 */
export function FirstRunPanel({ onSkip, setupSteps, onOpenRoute }: FirstRunPanelProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  // Measured on the row itself, never `useContentWidth()` — that reports the
  // window, and this composition lives in the content area left of the
  // sidebar. The band is a full-width sibling of the row, so one measurement
  // is the correct number for both; see `firstRunLayout.ts`.
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const regime = resolveEntryRowRegime(rowWidth);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.heading}>{t('onboarding.heading')}</Text>
        <Text style={styles.subheading}>{t('onboarding.subheading')}</Text>
      </View>

      <EntryCardView card={PRIMARY_CARD} primary onOpenRoute={onOpenRoute} />

      <View
        style={styles.row}
        onLayout={(e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width)}
      >
        {SECONDARY_CARDS.map((card) => (
          <EntryCardView
            key={card.route}
            card={card}
            regime={regime}
            onOpenRoute={onOpenRoute}
          />
        ))}
      </View>

      {/* Promoted from a rail card to a full-width band. No title, and that is
          settled rather than outstanding: a full-width strip of three
          labelled, ticked steps under the entry cards reads as a progress
          indicator, so the missing title key stopped being a gap when the
          shape changed. Do NOT add one. */}
      <SetupChecklist
        steps={setupSteps}
        layout={isChecklistBand(regime) ? 'band' : 'card'}
        onOpenStep={(step) => onOpenRoute(step.route)}
      />

      <TouchableOpacity
        style={styles.laterLink}
        onPress={onSkip}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Text style={styles.laterText}>{t('onboarding.later')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * One entry card.
 *
 * The primary is a horizontal strip (icon, text, chevron) because at full
 * content width a vertically stacked card would be a very wide, very short
 * band with its icon marooned at the top-left. The three secondaries are
 * vertical (icon above the text) because that is what reads as a card at a
 * third of the width, and it is what gives the row the height the
 * composition needs.
 */
function EntryCardView({
  card,
  primary = false,
  regime,
  onOpenRoute,
}: {
  card: EntryCard;
  primary?: boolean;
  regime?: EntryRowRegime;
  onOpenRoute: (route: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // `textInverse` is the correct token on a `primary` fill — it is
  // accent-derived precisely so it stays readable on whichever of the 13
  // accents is in use. `onSemantic` would be wrong: this is the brand
  // colour, not a semantic one.
  const foreground = primary ? theme.colors.textInverse : theme.colors.textPrimary;
  const iconColor = primary ? theme.colors.textInverse : theme.colors.primary;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        primary ? styles.cardPrimary : styles.cardSecondary,
        primary ? undefined : { flexBasis: entryCardBasis(regime ?? 'three') },
      ]}
      // One table decides which entries open over the dashboard and which
      // replace it (`dashboardDialogs.ts`), and it is applied once, by the
      // owner of the dialog slot — so this card just names its route.
      onPress={() => onOpenRoute(card.route)}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name={card.icon} size={primary ? 32 : 30} color={iconColor} />
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, primary && styles.cardLabelPrimary, { color: foreground }]}>
          {t(card.labelKey)}
        </Text>
        {card.hintKey ? (
          <Text
            style={[styles.cardHint, primary ? styles.cardHintPrimary : styles.cardHintSecondary]}
          >
            {t(card.hintKey)}
          </Text>
        ) : null}
      </View>
      {primary ? (
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textInverse} />
      ) : null}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  // Top-aligned and sized by content — deliberately no `justifyContent`,
  // `flex: 1` or `minHeight` here. See the component's doc comment.
  root: {
    gap: theme.spacing[5],
  },
  // The generous `marginBottom` is the composition's, not decoration: the
  // whole point of the rewrite is that the screen fills 855px without adding
  // content, and space between the question and the answers is space that
  // belongs to the question.
  header: {
    gap: theme.spacing[2],
    marginBottom: theme.spacing[8],
  },
  heading: {
    ...theme.textStyles.h1,
    color: theme.colors.textPrimary,
  },
  subheading: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'stretch' as const,
    gap: theme.spacing[5],
  },
  card: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    paddingHorizontal: theme.spacing[6],
  },
  cardPrimary: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[5],
    // Deliberately tall. At 1640px of content a card with ordinary padding
    // is a rule with words on it, not a card — and the height is what the
    // vertical budget is spent on instead of invented content.
    paddingVertical: theme.spacing[10],
    backgroundColor: theme.colors.primary,
    // Same 2px border as the outlined three, so the filled one is exactly as
    // tall for the same padding and the column does not sit half a pixel out.
    borderColor: theme.colors.primary,
  },
  cardSecondary: {
    // Vertical: icon above the text. `flexGrow` pairs with the `flexBasis`
    // the regime supplies, so the row wraps by itself with no arithmetic
    // against the gap.
    flexGrow: 1,
    minWidth: 0,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  cardLabelPrimary: {
    ...theme.textStyles.h2,
  },
  cardHint: {
    ...theme.textStyles.bodySm,
    marginTop: theme.spacing[1],
  },
  cardHintPrimary: {
    color: theme.colors.textInverse,
    opacity: 0.85,
  },
  cardHintSecondary: {
    color: theme.colors.textTertiary,
  },
  laterLink: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[5],
  },
  laterText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline' as const,
  },
});
