import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CategorizeReview } from '@/components/categorize/CategorizeReview';

export default function CategorizeScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <CategorizeReview onDone={() => router.back()} />
    </SafeAreaView>
  );
}
