import { isGlyphName } from '../categoryIcon';

/**
 * The map stands in for `Ionicons.glyphMap`: a plain object whose keys are
 * glyph names. Using a literal rather than the real map is the point — the
 * predicate takes the map as an argument precisely so this file needs no Expo
 * import, and so the prototype case below can be stated without depending on
 * whatever the real map happens to contain.
 */
const GLYPHS = { ellipse: 1, cart: 2, 'ellipsis-horizontal': 3 };

describe('isGlyphName', () => {
  // Would fail if the predicate stopped recognising real glyph names at all —
  // i.e. if a renderer were changed to draw every icon as text, which would
  // turn every existing category's icon into the literal string 'cart'.
  it('accepts a name the map actually carries', () => {
    expect(isGlyphName('ellipse', GLYPHS)).toBe(true);
    expect(isGlyphName('ellipsis-horizontal', GLYPHS)).toBe(true);
  });

  // Would fail if the predicate went back to a plain truthiness check, which is
  // what produced the `?` this module exists to remove: the server's own
  // proposed-category and deposit-category icons are emoji.
  it('rejects an emoji, which is what the server mints', () => {
    expect(isGlyphName('🏷️', GLYPHS)).toBe(false);
    expect(isGlyphName('💰', GLYPHS)).toBe(false);
  });

  // Would fail if `hasOwnProperty` were replaced by the `in` operator. Both of
  // these are inherited from Object.prototype, so `in` reports them as glyphs
  // and the renderer then draws nothing at all rather than the text.
  it('rejects an inherited key, so `in` cannot be substituted', () => {
    expect(isGlyphName('constructor', GLYPHS)).toBe(false);
    expect(isGlyphName('toString', GLYPHS)).toBe(false);
    expect(isGlyphName('hasOwnProperty', GLYPHS)).toBe(false);
  });

  // Would fail if the empty guard were dropped: '' is not an own key of the
  // map, so this happens to pass today, but null/undefined would throw once a
  // caller stopped pre-checking, and every caller does hand this an
  // `icon?: string`.
  it('treats an absent icon as not a glyph, without throwing', () => {
    expect(isGlyphName('', GLYPHS)).toBe(false);
    expect(isGlyphName(null, GLYPHS)).toBe(false);
    expect(isGlyphName(undefined, GLYPHS)).toBe(false);
  });
});
