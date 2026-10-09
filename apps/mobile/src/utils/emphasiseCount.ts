/**
 * Splits a translated label around its count so the number can be rendered in
 * a bold `<Text>`. Every locale puts the number last, but `lastIndexOf` keeps a
 * digit earlier in a translation safe. When the count does not appear in the
 * label (a translation that spells it out), `found` is false and the whole
 * label is `before`.
 */
export function emphasiseCount(
  label: string,
  count: number,
): { before: string; countText: string; after: string; found: boolean } {
  const countText = String(count);
  const at = label.lastIndexOf(countText);
  if (at < 0) return { before: label, countText, after: '', found: false };
  return {
    before: label.slice(0, at),
    countText,
    after: label.slice(at + countText.length),
    found: true,
  };
}
