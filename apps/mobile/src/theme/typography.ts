import { TextStyle } from 'react-native';

export const fontFamilies = {
  bold: 'Inter_700Bold',
  semiBold: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  regular: 'Inter_400Regular',
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 36,
  display: 48,
} as const;

export const lineHeights = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

export const textStyles = {
  display: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes.display,
  } as TextStyle,
  h1: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes['3xl'],
  } as TextStyle,
  h2: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes['2xl'],
  } as TextStyle,
  h3: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.lg,
  } as TextStyle,
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.base,
  } as TextStyle,
  bodyMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.base,
  } as TextStyle,
  bodyLarge: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.md,
  } as TextStyle,
  bodyLargeMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.md,
  } as TextStyle,
  bodyLargeSemiBold: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.md,
  } as TextStyle,
  bodySm: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.sm,
  } as TextStyle,
  bodySmMedium: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.sm,
  } as TextStyle,
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.xs,
  } as TextStyle,
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  button: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.md,
  } as TextStyle,
  tabLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
  } as TextStyle,
} as const;
