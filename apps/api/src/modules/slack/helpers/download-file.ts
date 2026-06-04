export interface DownloadedFile {
  buffer: Buffer;
  mimeType: string;
}

const SLACK_FILE_HOST = 'files.slack.com';

/**
 * Download a Slack file. `url_private_download` requires the bot token as a
 * Bearer header; the response is the raw bytes.
 *
 * The URL comes from the inbound webhook payload. Even though the webhook is
 * signature-verified, we defensively pin the host to files.slack.com over https
 * and refuse redirects, so the bot token can never be sent to a non-Slack host
 * (SSRF / token-leak defense in depth).
 */
export async function downloadSlackFile(
  urlPrivateDownload: string,
  botToken: string,
  mimeType: string,
): Promise<DownloadedFile> {
  let parsed: URL;
  try {
    parsed = new URL(urlPrivateDownload);
  } catch {
    throw new Error('Invalid Slack file URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== SLACK_FILE_HOST) {
    throw new Error(`Refusing to send bot token to non-Slack host: ${parsed.hostname}`);
  }

  const res = await fetch(urlPrivateDownload, {
    headers: { Authorization: `Bearer ${botToken}` },
    redirect: 'manual',
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `Slack file download refused redirect to ${res.headers.get('location') ?? 'unknown'}`,
    );
  }
  if (!res.ok) {
    throw new Error(`Slack file download failed: ${res.status}`);
  }
  const bytes = await res.arrayBuffer();
  return { buffer: Buffer.from(bytes), mimeType };
}
