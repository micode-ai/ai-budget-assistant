function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#1d1c1d;text-align:center}h1{font-size:20px}p{color:#454245;line-height:1.5}</style></head><body><h1>${escapeHtml(title)}</h1><p>${body}</p></body></html>`;
}

export function successPage(teamName?: string): string {
  const where = teamName ? `<b>${escapeHtml(teamName)}</b>` : 'your workspace';
  return page(
    'AI Budget Assistant installed 🎉',
    `The bot was added to ${where}. Open the AI Budget Assistant app → Settings → Chat bots → Slack, generate a 6-character code, then DM the bot <code>link YOUR_CODE</code> to connect your account.`,
  );
}

export function errorPage(message: string): string {
  return page('Installation problem', message);
}

export function notConfiguredPage(): string {
  return page('Not available', 'Slack installation is not configured on this server.');
}
