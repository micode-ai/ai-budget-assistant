import { Tabs, Redirect, router } from 'expo-router';
import { TouchableOpacity, Text, Image, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { AccountSwitcher, CurrencyPill } from '@/components/AccountSwitcher';
import { useAlertStore } from '@/stores/alertStore';
import { useTheme } from '@/theme';
import { HydrationProgressBar } from '@/components/HydrationProgressBar';

const tabIcons = {
  home: require('../../assets/widget-icons/home.png'),
  transactions: require('../../assets/widget-icons/transactions.png'),
  budget: require('../../assets/widget-icons/budget.png'),
  analytics: require('../../assets/widget-icons/analytics.png'),
  ai_chat: require('../../assets/widget-icons/ai_chat.png'),
};

function TabHeader({ title }: { title: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const unreadAlertCount = useAlertStore((s) => s.unreadCount);

  const btn = {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.18)',
  };

  return (
    <View style={{ backgroundColor: theme.colors.primary, paddingTop: insets.top }}>
      {/* Controls row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 8 }}>
        <AccountSwitcher compact showCurrency={false} />
        <CurrencyPill compact />
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity onPress={() => router.push('/alerts')} style={btn}>
            <Ionicons name="notifications-outline" size={20} color={theme.colors.textInverse} />
            {unreadAlertCount > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: -1,
                  right: -1,
                  minWidth: 15,
                  height: 15,
                  borderRadius: 7.5,
                  backgroundColor: '#E53935',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700' }}>
                  {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={btn}>
            <Ionicons name="settings-outline" size={20} color={theme.colors.textInverse} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Divider under the controls — same geometry as the home header
          (16px side padding + 95% width) so it lines up with page content. */}
      <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
        <View
          style={{
            width: '95%',
            height: 1.5,
            borderRadius: 1,
            backgroundColor: 'rgba(255,255,255,0.55)',
            marginTop: 10,
          }}
        />
      </View>

      {/* Page title — below the divider, its own row */}
      <Text
        numberOfLines={1}
        style={{
          textAlign: 'center',
          color: theme.colors.textInverse,
          fontFamily: theme.fonts.regular,
          fontSize: 17,
          paddingTop: 8,
          paddingBottom: 10,
          paddingHorizontal: 16,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <HydrationProgressBar />
      <Tabs
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== 'web') {
            Haptics.selectionAsync().catch(() => {});
          }
        },
      }}
      screenOptions={{
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderLight,
          paddingTop: 8,
          // Web needs more vertical room: react-native-web renders the icon +
          // label taller than native, so the label was clipped by the fixed
          // 60px height. Give it extra height + bottom padding on web only.
          paddingBottom: Platform.OS === 'web' ? 12 : 8 + insets.bottom,
          height: (Platform.OS === 'web' ? 74 : 60) + insets.bottom,
        },
        tabBarLabelStyle: {
          ...theme.textStyles.tabLabel,
        },
        // Custom two-row header: page title on its own top row, then the
        // account/currency pills + bell/settings row, then the divider.
        // Gives precise control over spacing (RN's default header centres the
        // side controls vertically, which left a long title overlapping them).
        header: ({ options }) => (
          <TabHeader title={typeof options.title === 'string' ? options.title : ''} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          title: t('nav.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Image source={tabIcons.home} style={[tabIconStyles.icon, { width: size, height: size, tintColor: color }]} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t('nav.expenses'),
          tabBarIcon: ({ color, size }) => (
            <Image source={tabIcons.transactions} style={[tabIconStyles.icon, { width: size, height: size, tintColor: color }]} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('nav.budgets'),
          tabBarIcon: ({ color, size }) => (
            <Image source={tabIcons.budget} style={[tabIconStyles.icon, { width: size, height: size, tintColor: color }]} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('nav.analytics'),
          tabBarIcon: ({ color, size }) => (
            <Image source={tabIcons.analytics} style={[tabIconStyles.icon, { width: size, height: size, tintColor: color }]} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('nav.aiChat'),
          tabBarIcon: ({ color, size }) => (
            <Image source={tabIcons.ai_chat} style={[tabIconStyles.icon, { width: size, height: size, tintColor: color }]} />
          ),
        }}
      />
      </Tabs>
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  icon: {
    resizeMode: 'contain',
  },
});
