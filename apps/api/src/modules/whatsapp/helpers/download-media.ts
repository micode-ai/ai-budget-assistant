const DEFAULT_API_VERSION = 'v21.0';

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Download media from WhatsApp Cloud API in 2 steps:
 *   1) GET https://graph.facebook.com/{api}/{media_id} -> { url, mime_type, sha256, file_size }
 *   2) GET {url} (same Bearer token) -> bytes
 *
 * The intermediate URL is single-use and expires in ~5 minutes.
 */
export async function downloadMedia(mediaId: string, accessToken: string): Promise<DownloadedMedia> {
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? DEFAULT_API_VERSION;

  const metaRes = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!metaRes.ok) {
    const body = await metaRes.text();
    throw new Error(`WhatsApp media meta fetch failed: ${metaRes.status} ${body}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) {
    throw new Error(`WhatsApp media file fetch failed: ${fileRes.status}`);
  }
  const bytes = await fileRes.arrayBuffer();

  return { buffer: Buffer.from(bytes), mimeType: meta.mime_type };
}
