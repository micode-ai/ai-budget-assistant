// Web-only viewport / safe-area fix.
//
// Why this is runtime JS and not `app/+html.tsx`: the app builds with
// `web.output: "single"` (SPA). `+html.tsx` is honored for *static* rendering
// but not for single-page output, so styles placed there never reach the page.
// This runs from the root layout, which is always in the JS bundle.
//
// What it fixes: on modern Android (15+) Chrome draws web content edge-to-edge
// *underneath* the system navigation bar (and iOS Safari under the home
// indicator), which clipped the bottom tab bar. We add `viewport-fit=cover`,
// pin the root to the dynamic viewport (`100dvh`), and pad the root by the OS
// bottom inset so the tab bar clears the nav bar.
//
// The spec way to read the inset is `env(safe-area-inset-bottom)`, but some
// Android Chrome builds report it as 0 even with `viewport-fit=cover`. So on
// touch Android we floor the padding at a sensible 3-button nav-bar height via
// `max(env(...), FALLBACK)`. Where `env()` resolves correctly (iOS, newer
// Chrome) the larger real value wins, so there is no double padding.

const STYLE_ID = 'web-safe-area-fix';
const ANDROID_NAV_FALLBACK_PX = 48;

function getRootEl(): HTMLElement | null {
  return (document.getElementById('root') as HTMLElement | null) ?? document.body ?? null;
}

// Read the actual resolved value of an `env(safe-area-inset-*)` in pixels by
// measuring a hidden probe element (works even when CSS `env()` is supported
// but reports 0).
function readEnvInsetPx(side: 'top' | 'bottom'): number {
  if (!document.body) return 0;
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;left:0;${side}:0;width:0;height:env(safe-area-inset-${side},0px);visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(h);
}

export function applyWebViewportFix(): void {
  if (typeof document === 'undefined') return;

  // 1. Opt into edge-to-edge so the browser exposes the OS safe-area insets.
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

  // 2. Pin the root chain to the dynamic viewport height (once).
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `@supports (height: 100dvh){html,body,#root{height:100dvh;}}`;
    document.head.appendChild(style);
  }

  // 3. Pad the actual root element by the bottom inset (floored on Android).
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const fallback = isAndroid && coarse ? `${ANDROID_NAV_FALLBACK_PX}px` : '0px';

  const rootEl = getRootEl();
  if (rootEl) {
    rootEl.style.boxSizing = 'border-box';
    rootEl.style.paddingBottom = `max(env(safe-area-inset-bottom, 0px), ${fallback})`;
  }

  // 4. Optional on-device diagnostics: open the site with `?sadebug=1` to see a
  //    small readout (not shown to normal visitors). Helps tune the inset.
  if (/[?&]sadebug=1\b/.test(window.location.search)) {
    showDebugOverlay(isAndroid, coarse, fallback);
  }
}

function showDebugOverlay(isAndroid: boolean, coarse: boolean, fallback: string): void {
  if (document.getElementById('sa-debug')) return;
  const envBottom = readEnvInsetPx('bottom');
  const envTop = readEnvInsetPx('top');
  const rootEl = document.getElementById('root') as HTMLElement | null;
  const pb = rootEl ? getComputedStyle(rootEl).paddingBottom : 'n/a';
  const box = document.createElement('div');
  box.id = 'sa-debug';
  box.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,0.85);color:#0f0;font:11px/1.4 monospace;padding:6px 8px;white-space:pre-wrap;pointer-events:none;';
  box.textContent = [
    `env.bottom=${envBottom}px env.top=${envTop}px`,
    `android=${isAndroid} coarse=${coarse} fallback=${fallback}`,
    `root#=${!!rootEl} root.pb=${pb}`,
    `innerH=${window.innerHeight} clientH=${document.documentElement.clientHeight} screenH=${window.screen?.height} dpr=${window.devicePixelRatio}`,
    `vv.h=${window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a'}`,
  ].join('\n');
  document.body.appendChild(box);
}
