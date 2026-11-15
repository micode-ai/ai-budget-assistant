import { router } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import { previousMonthParams } from '@/features/insights/previousMonth';

export interface DiscoveryItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  subtitleKey: string;
  /** Marks the AI-written entries with a sparkle (phone strip). */
  ai?: boolean;
  onPress: () => void;
}

/**
 * The Analytics tab's "discover" entries — Spending Story, Scenario Simulator,
 * yearly and monthly Wrapped, Real Salary — as ONE list. The desktop
 * `DiscoveryRow` lays them out as a card row, the phone `DiscoveryStrip` as a
 * horizontal strip; neither hardcodes its own copy, so an entry added here
 * reaches both layouts.
 *
 * `onOpenStory` differs by platform (desktop opens a dialog, phone navigates),
 * which is the only reason it is a parameter.
 */
export function discoveryItems(selectedYear: number, onOpenStory: () => void): DiscoveryItem[] {
  return [
    { key: 'story', icon: 'book-outline', titleKey: 'story.viewStory', subtitleKey: 'story.title', ai: true, onPress: onOpenStory },
    {
      key: 'scenario',
      icon: 'flask-outline',
      titleKey: 'scenarioSimulator.title',
      subtitleKey: 'scenarioSimulator.subtitle',
      onPress: () => router.push('/scenario-simulator'),
    },
    {
      key: 'wrapped',
      icon: 'gift-outline',
      titleKey: 'wrapped.title',
      subtitleKey: 'wrapped.introSub',
      ai: true,
      onPress: () => router.push({ pathname: '/wrapped', params: { year: String(selectedYear) } }),
    },
    {
      // Monthly Wrapped (ABA-641): always the month just ended — the one the 1st-of-month push opens.
      key: 'month-wrapped',
      icon: 'calendar-outline',
      titleKey: 'wrapped.monthTitle',
      subtitleKey: 'wrapped.monthIntroSub',
      onPress: () => router.push({ pathname: '/wrapped', params: previousMonthParams() }),
    },
    {
      key: 'real-salary',
      icon: 'trending-up-outline',
      titleKey: 'realSalary.entryTitle',
      subtitleKey: 'realSalary.entrySub',
      onPress: () => router.push('/real-salary'),
    },
  ];
}
