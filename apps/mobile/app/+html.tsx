import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web-only root HTML document. This file is used ONLY by the Expo web export
 * (`expo export --platform web`) to wrap every page; native iOS/Android builds
 * ignore it entirely.
 *
 * Mobile-web bottom-cutoff fix. Two things were clipping the bottom tab bar:
 *
 *  1. `100vh` is the *large* viewport on mobile browsers (as tall as if the URL
 *     bar were retracted), so the page was taller than the visible area → the
 *     tab bar fell below the fold. Pinning the root to the *dynamic* viewport
 *     (`100dvh`) makes the layout always fit the currently-visible viewport.
 *
 *  2. Modern Android (15+) Chrome draws web content edge-to-edge *underneath*
 *     the system navigation bar, and iOS Safari draws under the home indicator.
 *     `viewport-fit=cover` is required to expose the OS inset via
 *     `env(safe-area-inset-bottom)`, and we then apply that inset as bottom
 *     padding on `#root` so the whole layout (incl. the tab bar) stays clear of
 *     the nav bar. `react-native-safe-area-context` reports `insets.bottom = 0`
 *     on web, so this CSS padding is what actually creates the gap — the tab
 *     bar's own `insets.bottom` padding is a no-op here.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/*
          Disable body scrolling on web so the app's own ScrollViews handle it.
          Must come BEFORE our height override so source order keeps `100dvh`.
        */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: viewportFixStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Use the dynamic viewport height where supported so the bottom tab bar is
// never hidden behind the browser URL bar, and pad the root by the OS bottom
// inset so it clears the system navigation bar (Android 15+ edge-to-edge) /
// home indicator (iOS). `env(safe-area-inset-bottom)` falls back to 0 on
// browsers that don't draw under the system bars, so there is no regression
// there. `box-sizing: border-box` keeps the padded root exactly one viewport
// tall instead of overflowing.
const viewportFixStyle = `
@supports (height: 100dvh) {
  html,
  body,
  #root {
    height: 100dvh;
  }
}
#root {
  box-sizing: border-box;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
`;
