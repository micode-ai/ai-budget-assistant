import * as https from 'https';

/**
 * Downloads a file from a URL and returns it as a Buffer.
 * Uses Node.js https module which is more reliable than fetch on Windows.
 */
export function downloadFile(url: string | URL): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const href = typeof url === 'string' ? url : url.href;

    https.get(href, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} downloading file`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
