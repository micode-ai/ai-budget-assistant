import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web-only root HTML document. This file is used ONLY by the Expo web export
 * (`expo export --platform web`) to wrap every page; native iOS/Android builds
 * ignore it entirely.
 *
 * Mobile-web bottom-cutoff fix: the app root used to fill `100vh`, which on
 * mobile browsers is the *large* viewport (as tall as if the URL bar were
 * retracted). While the URL bar / system navigation bar is visible the page is
 * therefore taller than the visible area, so the bottom tab bar fell below the
 * fold and looked clipped. We pin the root to the *dynamic* viewport height
 * (`100dvh`) so the layout always fits the currently-visible viewport, and add
 * `viewport-fit=cover` so iOS Safari safe-area insets (home indicator) resolve
 * via react-native-safe-area-context.
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
// never hidden behind the browser URL bar or the system navigation bar. Falls
// back to `100%` (the ScrollViewStyleReset default) on older browsers.
const viewportFixStyle = `
@supports (height: 100dvh) {
  html,
  body,
  #root {
    height: 100dvh;
  }
}
`;
