import { Tabs, Redirect, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';

type IconName = keyof typeof Ionicons.glyphMap;

export default function TabLayout() {
  const { isAuthenticated, logout } = useAuthStore();
  const { t } = useTranslation();

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4ECDC4',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
          paddingTop: 8,
          paddingBottom: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: '#4ECDC4',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={async () => { await logout(); router.replace('/(auth)/login'); }}
            style={{ marginRight: 16 }}
          >
            <Ionicons name="log-out-outline" size={24} color="#fff" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t('nav.expenses'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('nav.budgets'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: t('nav.analytics'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t('nav.aiChat'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
