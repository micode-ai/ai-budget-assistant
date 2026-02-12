import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface SectionMeta {
  id: string;
  icon: IconName;
  color: string;
}

export const sectionsMeta: SectionMeta[] = [
  { id: '01-getting-started', icon: 'rocket-outline', color: '#4ECDC4' },
  { id: '02-dashboard', icon: 'grid-outline', color: '#45B7D1' },
  { id: '03-expenses-and-income', icon: 'swap-vertical-outline', color: '#FF6B6B' },
  { id: '04-voice-and-receipt', icon: 'mic-outline', color: '#F5A623' },
  { id: '05-budgets', icon: 'pie-chart-outline', color: '#96CEB4' },
  { id: '06-analytics', icon: 'bar-chart-outline', color: '#9B59B6' },
  { id: '07-ai-chat', icon: 'chatbubbles-outline', color: '#3498DB' },
  { id: '08-spending-story', icon: 'book-outline', color: '#E74C3C' },
  { id: '09-accounts', icon: 'people-outline', color: '#2ECC71' },
  { id: '10-wallet-and-exchange', icon: 'wallet-outline', color: '#F39C12' },
  { id: '11-settings', icon: 'settings-outline', color: '#7F8C8D' },
  { id: '12-subscription', icon: 'diamond-outline', color: '#E67E22' },
];
