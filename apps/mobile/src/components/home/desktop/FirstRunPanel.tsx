import { useState } from 'react';
import { View, Text, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

/**
 * Below this measured width the 2x2 entry grid becomes 1x4.
 *
 * Measured with `onLayout` on the grid itself, **not** `useContentWidth()`:
 * that hook reports the window (capped), which is right for a single-column
 * screen and wrong here — this grid lives in a fluid focus column whose width
 * is whatever the rail(s) leave behind. At a 1024px window the column is
 * around 424px and must go single-file; at 1440 it is around 840 and fits two
 * across; at 1680, with the second rail taking another 320, it is around 760
 * and still fits.
 */
export const FIRST_RUN_GRID_MIN_WIDTH = 700;

type IconName = keyof typeof Ionicons.glyphMap;

interface EntryCard {
  icon: IconName;
  labelKey: string;
  hintKey?: string;
  route: string;
}

/**
 * **The primary card is Import, not Scan receipt — a deliberate divergence
 * from mobile's ordering, not an oversight.** The camera is on the phone and
 * the bank statement is on the laptop; importing is also the only one of the
 * four that turns every card on this dashboard into a real number in a single
 * step. Voice is last for the same environmental reason: dictating at a desk
 * is the least natural of the four. It is not removed.
 *
 * `app/get-started.tsx` keeps its own, opposite order and is untouched.
 *
 * Every route here already exists and is reached exactly as `get-started`
 * reaches it — a plain `router.push`. No entry logic is written here.
 */
const ENTRY_CARDS: EntryCard[] = [
  {
    icon: 'cloud-download-outline',
    labelKey: 'onboarding.bringHistory',
    hintKey: 'onboarding.bringHistoryHint',
    route: '/settings/import',
  },
  {
    icon: 'receipt-outline',
    labelKey: 'onboarding.scanReceipt',
    hintKey: 'onboarding.scanReceiptHint',
    route: '/expense/receipt',
  },
  { icon: 'create-outline', labelKey: 'onboarding.typeManually', route: '/expense/new' },
  { icon: 'mic-outline', labelKey: 'onboarding.useVoice', route: '/expense/voice' },
];

interface FirstRunPanelProps {
  /** The skip link — marks `seen` and reveals the ordinary dashboard. */
  onSkip: () => void;
}

/**
 * The desktop dashboard's first-run state (`docs/design/2026-09-06-dashboard-
 * retention-and-onboarding-web.md`'s "What the first-run dashboard shows"):
 * heading, subheading, a 2x2 grid of entry paths, and a skip link — rendered
 * in place of the focus column's five slots, inside the same two-column shape,
 * so the layout the user learns is the layout they will use.
 *
 * **No mock data anywhere.** No greyed skeleton cards, no sample chart, no
 * placeholder numbers: a dashboard that shows invented figures to teach a
 * layout is teaching the user to distrust the figures.
 *
 * **Tapping a card does NOT mark `seen`.** `get-started.tsx` does, because it
 * is a screen the user navigates away from; this is the dashboard itself, and
 * a user who opens the receipt scanner, changes their mind and comes back must
 * find the invitation still here rather than the nine empty cards this state
 * exists to replace. The state ends on evidence (a transaction landed) or on
 * an explicit skip — see `useWebFirstRun`.
 *
 * Web-only: reached solely from `FocusColumn`, itself reached solely from
 * `DashboardDesktop`, which `DashboardView.web.tsx` alone renders.
 */
export function FirstRunPanel({ onSkip }: FirstRunPanelProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);

  // `null` until the first layout pass. Treated as two-up because that is the
  // regime at every width from 1440 up; the alternative default would flash a
  // stacked list on the wide windows this state is designed around.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const twoUp = gridWidth === null || gridWidth >= FIRST_RUN_GRID_MIN_WIDTH;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.heading}>{t('onboarding.heading')}</Text>
        <Text style={styles.subheading}>{t('onboarding.subheading')}</Text>
      </View>

      <View
        style={styles.grid}
        onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)}
      >
        {ENTRY_CARDS.map((card, index) => (
          <EntryCardView key={card.route} card={card} primary={index === 0} twoUp={twoUp} />
        ))}
      </View>

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

function EntryCardView({
  card,
  primary,
  twoUp,
}: {
  card: EntryCard;
  primary: boolean;
  twoUp: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // `textInverse` is the correct token on a `primary` fill — it is
  // accent-derived precisely so it stays readable on whichever of the 13
  // accents is in use. `onSemantic` would be wrong here: this is the brand
  // colour, not a semantic one.
  const foreground = primary ? theme.colors.textInverse : theme.colors.textPrimary;
  const iconColor = primary ? theme.colors.textInverse : theme.colors.primary;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        primary ? styles.cardPrimary : styles.cardSecondary,
        // flexGrow + a wrapping row is what produces two-across without any
        // percentage arithmetic against the gap: two 45% bases fit one row,
        // a third cannot, and grow then fills the slack exactly.
        { flexBasis: twoUp ? '45%' : '100%' },
      ]}
      onPress={() => router.push(card.route as never)}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <Ionicons name={card.icon} size={26} color={iconColor} />
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, { color: foreground }]}>{t(card.labelKey)}</Text>
        {card.hintKey ? (
          <Text
            style={[styles.cardHint, primary ? styles.cardHintPrimary : styles.cardHintSecondary]}
          >
            {t(card.hintKey)}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={primary ? theme.colors.textInverse : theme.colors.textTertiary}
      />
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  header: {
    marginBottom: theme.spacing[6],
    gap: theme.spacing[1],
  },
  heading: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  subheading: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'stretch' as const,
    gap: theme.spacing[4],
  },
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flexGrow: 1,
    minWidth: 0,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing[5],
    paddingHorizontal: theme.spacing[4],
  },
  cardPrimary: {
    backgroundColor: theme.colors.primary,
    // A 2px border on every card, so the filled one is the same size as the
    // three outlined ones and the row does not sit half a pixel out of line.
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  cardSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardLabel: {
    ...theme.textStyles.bodyLargeSemiBold,
  },
  cardHint: {
    ...theme.textStyles.bodySm,
    marginTop: 2,
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
    paddingVertical: theme.spacing[4],
    marginTop: theme.spacing[2],
  },
  laterText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline' as const,
  },
});
