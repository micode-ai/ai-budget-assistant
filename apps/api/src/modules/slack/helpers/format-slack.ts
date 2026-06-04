/**
 * Convert the standard-markdown text returned by ChatService into Slack mrkdwn.
 * - **bold**            -> *bold*
 * - [label](url)        -> <url|label>
 * - leaves _italic_ and `code` untouched (already valid mrkdwn)
 */
export function markdownToSlack(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<$2|$1>');
}
