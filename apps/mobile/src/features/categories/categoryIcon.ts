/**
 * A category's `icon` is stored as one of two different things, and nothing in
 * the schema says which.
 *
 * Most categories carry an **Ionicons glyph name** (`'cart'`, `'ellipse'`) —
 * that is what the category editor writes and what every renderer assumed.
 * But the server mints categories of its own with an **emoji**: the receipt
 * category-split flow creates a proposed category with `🏷️`, and the returnable
 * -packaging category (`Kaucja`/`Pfand`/…) is created the same way. An emoji is
 * not a glyph name, so `<Ionicons name={emoji} />` finds nothing and draws its
 * missing-glyph mark — a literal `?` — beside a category the app created for
 * the user itself.
 *
 * So a renderer has to ask which vocabulary it was handed. This is that
 * question, kept pure and with the map injected so it needs no Expo import and
 * can be tested against a literal.
 *
 * **`hasOwnProperty`, never the `in` operator.** `Ionicons.glyphMap` is a plain
 * object, so `'constructor' in glyphMap` and `'toString' in glyphMap` are both
 * true — an icon value of `constructor` would be reported as a real glyph and
 * then render as nothing at all. It is the same false-positive the AI-import
 * validator avoids by holding its allow-list in a `Set` rather than an object.
 */
export function isGlyphName(
  icon: string | null | undefined,
  glyphMap: Record<string, unknown>,
): boolean {
  if (!icon) return false;
  return Object.prototype.hasOwnProperty.call(glyphMap, icon);
}
