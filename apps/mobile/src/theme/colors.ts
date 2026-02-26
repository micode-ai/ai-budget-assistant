export interface ThemeColors {
  // Brand
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  accent: string;

  // Semantic
  success: string;
  warning: string;
  warningLight: string;
  danger: string;
  dangerLight: string;
  info: string;

  // Surfaces
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSecondary: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  textLink: string;
  textDisabled: string;

  // Borders
  border: string;
  borderLight: string;
  divider: string;

  // Overlays
  overlay: string;
  scrim: string;

  // Status / Progress
  progressTrack: string;
  tabBarActive: string;
  tabBarInactive: string;

  // Chat
  messageBubbleUser: string;
  messageBubbleAI: string;
  messageBubbleUserText: string;
  messageBubbleAIText: string;
}

export const lightColors: ThemeColors = {
  // Brand
  primary: '#E37F2B',
  primaryLight: '#FDF0E4',
  primaryDark: '#C46A1A',
  secondary: '#F5A623',
  accent: '#FFBA60',

  // Semantic
  success: '#4CAF50',
  warning: '#F5A623',
  warningLight: '#FFF3DC',
  danger: '#FF6B6B',
  dangerLight: '#FFE5E5',
  info: '#45B7D1',

  // Surfaces
  background: '#F8FAFB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSecondary: '#F2F4F7',

  // Text
  textPrimary: '#1A1D26',
  textSecondary: '#5E6272',
  textTertiary: '#9CA3B4',
  textInverse: '#FFFFFF',
  textLink: '#E37F2B',
  textDisabled: '#C5C9D6',

  // Borders
  border: '#E2E5EB',
  borderLight: '#EEF0F4',
  divider: '#F0F1F4',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  scrim: 'rgba(0, 0, 0, 0.3)',

  // Status / Progress
  progressTrack: '#E2E5EB',
  tabBarActive: '#E37F2B',
  tabBarInactive: '#9CA3B4',

  // Chat
  messageBubbleUser: '#E37F2B',
  messageBubbleAI: '#FFFFFF',
  messageBubbleUserText: '#FFFFFF',
  messageBubbleAIText: '#1A1D26',
};

export const darkColors: ThemeColors = {
  // Brand
  primary: '#E37F2B',
  primaryLight: '#3D2A10',
  primaryDark: '#FFBA60',
  secondary: '#F5A623',
  accent: '#FFBA60',

  // Semantic
  success: '#4CAF50',
  warning: '#F5A623',
  warningLight: '#3D2E0A',
  danger: '#FF6B6B',
  dangerLight: '#3D1A1A',
  info: '#45B7D1',

  // Surfaces
  background: '#000000',
  surface: '#1A1A1A',
  surfaceElevated: '#252525',
  surfaceSecondary: '#1E1E1E',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textTertiary: '#7F7F7C',
  textInverse: '#FFFFFF',
  textLink: '#E37F2B',
  textDisabled: '#4A4A4A',

  // Borders
  border: '#333333',
  borderLight: '#2A2A2A',
  divider: '#222222',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.7)',
  scrim: 'rgba(0, 0, 0, 0.5)',

  // Status / Progress
  progressTrack: '#333333',
  tabBarActive: '#E37F2B',
  tabBarInactive: '#7F7F7C',

  // Chat
  messageBubbleUser: '#E37F2B',
  messageBubbleAI: '#1A1A1A',
  messageBubbleUserText: '#FFFFFF',
  messageBubbleAIText: '#FFFFFF',
};
