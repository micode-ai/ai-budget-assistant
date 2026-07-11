import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface WrappedShareLine {
  emoji: string;
  label: string;
  value: string;
}

export interface WrappedSharePayload {
  /** Used only to name the generated file (wrapped-<year>.png). */
  year: number | string;
  title: string;
  lines: WrappedShareLine[];
  footer: string;
}

export interface WrappedShareCardHandle {
  /** Renders the payload to a PNG story card and opens the native share sheet. Resolves false on any failure. */
  share: (payload: WrappedSharePayload) => Promise<boolean>;
}

const SHARE_TIMEOUT_MS = 8000;

// Self-contained HTML document — no external scripts/fonts/images (CSP-safe, works fully offline).
// System fonts render emoji + Cyrillic/Latin/etc. fine on-device.
const CARD_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #000; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="c" width="1080" height="1920"></canvas>
    <script>
      function wrapText(ctx, text, maxWidth) {
        var words = String(text || '').split(' ');
        var lines = [];
        var current = '';
        for (var i = 0; i < words.length; i++) {
          var word = words[i];
          var test = current ? (current + ' ' + word) : word;
          if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines;
      }

      function draw(payload) {
        var canvas = document.getElementById('c');
        var ctx = canvas.getContext('2d');
        var W = canvas.width;
        var H = canvas.height;

        var grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#7C3AED');
        grad.addColorStop(1, '#DB2777');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';

        var y = 150;

        ctx.textAlign = 'center';
        ctx.font = '700 68px -apple-system, Roboto, Arial, sans-serif';
        var titleLines = wrapText(ctx, payload.title, W - 160);
        for (var t = 0; t < titleLines.length; t++) {
          ctx.fillText(titleLines[t], W / 2, y);
          y += 84;
        }
        y += 50;

        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 110, y);
        ctx.lineTo(W / 2 + 110, y);
        ctx.stroke();
        y += 70;

        ctx.textAlign = 'left';
        var contentX = 110;
        var contentWidth = W - contentX * 2;
        var emojiColW = 100;

        var linesArr = payload.lines || [];
        for (var i = 0; i < linesArr.length; i++) {
          var item = linesArr[i] || {};
          ctx.font = '54px -apple-system, Roboto, Arial, sans-serif';
          ctx.fillText(item.emoji || '', contentX, y);

          ctx.font = '600 32px -apple-system, Roboto, Arial, sans-serif';
          var labelLines = wrapText(ctx, item.label || '', contentWidth - emojiColW);
          var ly = y + 4;
          for (var l = 0; l < labelLines.length; l++) {
            ctx.fillText(labelLines[l], contentX + emojiColW, ly);
            ly += 42;
          }

          if (item.value) {
            ctx.font = '700 44px -apple-system, Roboto, Arial, sans-serif';
            var valueLines = wrapText(ctx, item.value, contentWidth - emojiColW);
            for (var v = 0; v < valueLines.length; v++) {
              ctx.fillText(valueLines[v], contentX + emojiColW, ly);
              ly += 54;
            }
          }

          y = Math.max(ly, y + 96) + 34;
        }

        ctx.textAlign = 'center';
        ctx.font = '600 30px -apple-system, Roboto, Arial, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(payload.footer || '', W / 2, H - 130);
      }

      window.__renderWrapped = function (payloadJson) {
        try {
          var payload = JSON.parse(payloadJson);
          draw(payload);
          var canvas = document.getElementById('c');
          var url = canvas.toDataURL('image/png');
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(url);
          }
        } catch (e) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage('ERROR:' + String(e));
          }
        }
      };

      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('ready');
      }
    </script>
  </body>
</html>`;

/**
 * Hidden WebView that renders a 1080x1920 "story card" PNG from a Wrapped payload
 * and shares it via the native share sheet. No native module — canvas.toDataURL()
 * + expo-file-system + expo-sharing only (mirrors ExpenseMapView's WebView-bridge
 * pattern and reportStore's File/Sharing pattern).
 */
export const WrappedShareCard = forwardRef<WrappedShareCardHandle>(function WrappedShareCard(_props, ref) {
  const webviewRef = useRef<WebView>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJsRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const yearRef = useRef<number | string>('share');

  const finish = (ok: boolean) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(ok);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const onLoadEnd = () => {
    loadedRef.current = true;
    if (pendingJsRef.current) {
      const js = pendingJsRef.current;
      pendingJsRef.current = null;
      webviewRef.current?.injectJavaScript(js);
    }
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    if (data === 'ready') return; // page-load ack, not a share result
    if (!resolverRef.current) return; // no pending share awaiting a result

    if (!data || !data.startsWith('data:image/png') || data === 'undefined') {
      finish(false);
      return;
    }

    (async () => {
      try {
        const base64 = data.split(',')[1];
        if (!base64) {
          finish(false);
          return;
        }
        const fileName = `wrapped-${yearRef.current}.png`;
        const file = new File(Paths.cache, fileName);
        file.write(base64, { encoding: 'base64' });

        if (!(await Sharing.isAvailableAsync())) {
          finish(false);
          return;
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: 'image/png',
          dialogTitle: fileName,
        });
        finish(true);
      } catch {
        finish(false);
      }
    })();
  };

  useImperativeHandle(ref, () => ({
    share: (payload: WrappedSharePayload) =>
      new Promise<boolean>((resolve) => {
        // Only one share in flight at a time — a stale pending resolver would
        // otherwise get overwritten and silently never resolve.
        if (resolverRef.current) {
          finish(false);
        }
        yearRef.current = payload.year;
        resolverRef.current = resolve;
        timeoutRef.current = setTimeout(() => finish(false), SHARE_TIMEOUT_MS);

        const js = `window.__renderWrapped(${JSON.stringify(JSON.stringify(payload))}); true;`;
        if (loadedRef.current && webviewRef.current) {
          try {
            webviewRef.current.injectJavaScript(js);
          } catch {
            finish(false);
          }
        } else {
          // WebView hasn't finished its initial load yet — queue and flush on onLoadEnd.
          pendingJsRef.current = js;
        }
      }),
  }));

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: CARD_HTML }}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        style={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  // Off-screen but still mounted/executing — WebView JS runs even at ~0 size.
  hidden: { position: 'absolute', top: -2000, left: -2000, width: 4, height: 4, opacity: 0 },
  webview: { width: 4, height: 4 },
});
