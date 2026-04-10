import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const { isAuthenticated, user } = useAuthStore();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  // Unverified user with active session — send to email verification
  if (user && !user.isVerified) {
    return <Redirect href={{ pathname: '/(auth)/verify-email', params: { email: user.email } }} />;
  }

  return <Redirect href="/(auth)/login" />;
}
