import { Tabs, Redirect, router } from 'expo-router';
import { TouchableOpacity, Image, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { AccountSwitcher } from '@/components/AccountSwitcher';
import { useTheme } from '@/theme';
import { HydrationProgressBar } from '@/components/HydrationProgressBar';

const tabIcons = {
  home: require('../../assets/widget-icons/home.png'),
  transactions: require('../../assets/widget-icons/transactions.png'),
  budget: require('../../assets/widget-icons/budget.png'),
  analytics: require('../../assets/widget-icons/analytics.png'),
  ai_chat: require('../../assets/widget-icons/ai_chat.png'),
};

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
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: theme.colors.textInverse,
        headerTitleStyle: {
          fontFamily: theme.fonts.bold,
          fontSize: 18,
        },
        headerTitleAlign: 'center',
        headerTitleContainerStyle: { transform: [{ translateX: 20 }] },
        headerLeft: () => <AccountSwitcher />,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={{ marginRight: 16, width: 56, alignItems: 'flex-end' }}
          >
            <Ionicons name="settings-outline" size={24} color={theme.colors.textInverse} />
          </TouchableOpacity>
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
