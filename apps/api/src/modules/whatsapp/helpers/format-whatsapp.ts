/**
 * Convert Markdown produced by ChatService into WhatsApp-flavored text.
 *
 * WhatsApp uses *single-asterisk* for bold AND we need to convert Markdown
 * _italic_ at the same time. Doing the replaces in the wrong order makes the
 * italic regex eat the inner characters of **bold**. To avoid that, stash
 * bold behind a unique placeholder, do the italic pass, then restore bold.
 */
const BOLD_OPEN = 'BO';
const BOLD_CLOSE = 'BC';

export function markdownToWhatsApp(markdown: string): string {
  let out = markdown;
  // 1) Stash **bold**
  out = out.replace(/\*\*(.+?)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`);
  // 2) *italic* -> _italic_
  out = out.replace(/\*([^*\n]+?)\*/g, '_$1_');
  // 3) Restore stashed bold as WhatsApp *bold*
  out = out.split(BOLD_OPEN).join('*').split(BOLD_CLOSE).join('*');
  return out;
}
