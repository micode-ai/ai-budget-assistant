import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isGlyphName } from '@/features/categories/categoryIcon';

type GlyphName = keyof typeof Ionicons.glyphMap;

interface Props {
  /** The category's stored `icon`: an Ionicons glyph name, an emoji, or empty. */
  icon: string | null | undefined;
  size: number;
  /** Applied to a glyph. An emoji carries its own colours and ignores this. */
  color: string;
  /** Drawn when the category has no icon at all. */
  fallback?: GlyphName;
  style?: StyleProp<TextStyle>;
}

/**
 * One category icon, whichever of the two vocabularies it was stored in —
 * see `src/features/categories/categoryIcon.ts` for why there are two.
 *
 * **This exists as a component rather than a helper because there are two call
 * sites, not one.** The categories settings screen and the calendar's
 * transaction rows both draw this field, and both had their own
 * `<Ionicons name={(x as GlyphName) || 'fallback'} />` with its own fallback —
 * so a fix applied to one of them would have left the other still printing a
 * `?`, and the next screen to draw a category icon would have written a third
 * copy of the same mistake.
 *
 * An emoji is drawn as text at 0.9 of the nominal size: an emoji glyph has more
 * ink than an icon of the same em size, so matching them numerically makes the
 * emoji look larger than the icons it sits in a column with. `lineHeight`
 * leaves room for the taller ones rather than clipping them.
 */
export function CategoryIcon({ icon, size, color, fallback = 'ellipse', style }: Props) {
  if (isGlyphName(icon, Ionicons.glyphMap)) {
    return <Ionicons name={icon as GlyphName} size={size} color={color} style={style} />;
  }

  if (icon) {
    return (
      <Text
        style={[{ fontSize: size * 0.9, lineHeight: size * 1.15 }, style]}
        // The emoji IS the label here, so it must not be read out as one:
        // every call site puts the category's name next to it.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {icon}
      </Text>
    );
  }

  return <Ionicons name={fallback} size={size} color={color} style={style} />;
}
