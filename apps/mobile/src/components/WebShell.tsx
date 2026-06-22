import React from 'react';
import { View, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme';
import { WebSidebar } from '@/components/WebSidebar';
import { WebTopBar } from '@/components/WebTopBar';
import { useIsDesktopWeb } from '@/components/webLayout.constants';

export function WebShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktopWeb();

  // Mobile / narrow web: render exactly what we render today. Only one hook
  // (useIsDesktopWeb) runs here, so native never subscribes to route/auth/theme.
  if (!isDesktop) {
    return <>{children}</>;
  }

  return <DesktopShell>{children}</DesktopShell>;
}

function DesktopShell({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pathname = usePathname();
  const theme = useTheme();

  const onAuthRoute =
    pathname.startsWith('/(auth)') ||
    pathname.includes('login') ||
    pathname.includes('register') ||
    pathname.includes('forgot-password') ||
    pathname.includes('reset-password') ||
    pathname.includes('verify-email');

  // Unauthenticated / auth flow: no app chrome — just center the form so the
  // login/register screen isn't a stretched full-width sheet.
  if (!isAuthenticated || onAuthRoute) {
    return (
      <View style={[styles.authRoot, { backgroundColor: theme.colors.background }]}>
        <View style={styles.authColumn}>{children}</View>
      </View>
    );
  }

  // App chrome: full-width top bar over everything, then the sidebar + the
  // content area. The active screen fills the whole area right of the sidebar,
  // so its scrollbar sits at the window's right edge (a "general" page scroll)
  // with no dead gutters. Charts stay capped via useContentWidth.
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <WebTopBar />
      <View style={styles.body}>
        <WebSidebar />
        <View style={styles.contentArea}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  contentArea: { flex: 1 },
  authRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authColumn: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
