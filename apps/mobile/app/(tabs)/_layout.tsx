import { Tabs, Redirect, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { AccountSwitcher } from '@/components/AccountSwitcher';
import { useTheme } from '@/theme';

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
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderLight,
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
          height: 60 + insets.bottom,
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
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t('nav.expenses'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="swap-vertical" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('nav.budgets'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('nav.analytics'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('nav.aiChat'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
