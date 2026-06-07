// Web-only viewport / safe-area fix.
//
// Why this is runtime JS and not `app/+html.tsx`: the app builds with
// `web.output: "single"` (SPA). `+html.tsx` is honored for *static* rendering
// but not reliably for single-page output, so styles placed there may never
// reach the page. This runs from the root layout, which is always in the JS
// bundle, so it always applies.
//
// What it fixes: on modern Android (15+) Chrome draws web content edge-to-edge
// *underneath* the system navigation bar (and iOS Safari under the home
// indicator), which clipped the bottom tab bar. We:
//   1. add `viewport-fit=cover` to the viewport meta — required for the browser
//      to expose the OS inset via `env(safe-area-inset-bottom)`;
//   2. pin the root to the dynamic viewport (`100dvh`) and pad it by that inset
//      so the whole layout (incl. the tab bar) stays clear of the nav bar.
// On browsers that don't draw under the system bars, the inset resolves to 0 —
// no regression.

const STYLE_ID = 'web-safe-area-fix';

export function applyWebViewportFix(): void {
  if (typeof document === 'undefined') return;

  // 1. Ensure the viewport meta opts into edge-to-edge so safe-area insets resolve.
  let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  const content = meta.getAttribute('content') || 'width=device-width, initial-scale=1';
  if (!/viewport-fit\s*=\s*cover/.test(content)) {
    meta.setAttribute('content', `${content}, viewport-fit=cover`);
  }

  // 2. Inject the height + safe-area padding rules (once).
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@supports (height: 100dvh) {
  html, body, #root { height: 100dvh; }
}
#root {
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
`;
  document.head.appendChild(style);
}
