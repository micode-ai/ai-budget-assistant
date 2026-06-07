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
  { id: '13-gamification', icon: 'trophy-outline', color: '#F5A623' },
  { id: '14-investments', icon: 'trending-up-outline', color: '#27AE60' },
  { id: '15-encryption', icon: 'lock-closed-outline', color: '#8E44AD' },
  { id: '16-export-reports', icon: 'download-outline', color: '#16A085' },
  { id: '17-debts-and-loans', icon: 'people-outline', color: '#E91E63' },
  { id: '18-savings-goals', icon: 'flag-outline', color: '#3F51B5' },
  { id: '19-fat-finder', icon: 'search-outline', color: '#FF9800' },
  { id: '20-ai-response-mode', icon: 'options-outline', color: '#00BCD4' },
  { id: '21-widgets', icon: 'grid-outline', color: '#4ECDC4' },
  { id: '22-chat-bots', icon: 'chatbubble-ellipses-outline', color: '#6366F1' },
  { id: '23-scenario-simulator', icon: 'flask-outline', color: '#FF9800' },
  { id: '24-referral', icon: 'gift-outline', color: '#E91E63' },
  { id: '27-bank-import', icon: 'business-outline', color: '#E91E63' },
  { id: '28-reference-data', icon: 'pricetags-outline', color: '#10B981' },
  { id: '29-subscription-manager', icon: 'repeat-outline', color: '#6366F1' },
  { id: '30-web-app', icon: 'globe-outline', color: '#0EA5E9' },
];
