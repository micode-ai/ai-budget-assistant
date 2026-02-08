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
  primary: '#4ECDC4',
  primaryLight: '#E8F8F7',
  primaryDark: '#3BA99F',
  secondary: '#45B7D1',
  accent: '#96CEB4',

  // Semantic
  success: '#4ECDC4',
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
  textLink: '#4ECDC4',
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
  tabBarActive: '#4ECDC4',
  tabBarInactive: '#9CA3B4',

  // Chat
  messageBubbleUser: '#4ECDC4',
  messageBubbleAI: '#FFFFFF',
  messageBubbleUserText: '#FFFFFF',
  messageBubbleAIText: '#1A1D26',
};

export const darkColors: ThemeColors = {
  // Brand
  primary: '#4ECDC4',
  primaryLight: '#1A3B38',
  primaryDark: '#6EE0D8',
  secondary: '#45B7D1',
  accent: '#96CEB4',

  // Semantic
  success: '#4ECDC4',
  warning: '#F5A623',
  warningLight: '#3D2E0A',
  danger: '#FF6B6B',
  dangerLight: '#3D1A1A',
  info: '#45B7D1',

  // Surfaces
  background: '#0F1117',
  surface: '#1A1D26',
  surfaceElevated: '#232636',
  surfaceSecondary: '#252838',

  // Text
  textPrimary: '#F0F1F5',
  textSecondary: '#A0A4B8',
  textTertiary: '#6B6F82',
  textInverse: '#0F1117',
  textLink: '#4ECDC4',
  textDisabled: '#4A4D5E',

  // Borders
  border: '#2E3145',
  borderLight: '#252838',
  divider: '#232636',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.7)',
  scrim: 'rgba(0, 0, 0, 0.5)',

  // Status / Progress
  progressTrack: '#2E3145',
  tabBarActive: '#4ECDC4',
  tabBarInactive: '#6B6F82',

  // Chat
  messageBubbleUser: '#4ECDC4',
  messageBubbleAI: '#1A1D26',
  messageBubbleUserText: '#0F1117',
  messageBubbleAIText: '#F0F1F5',
};
