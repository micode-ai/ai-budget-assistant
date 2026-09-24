import { router } from 'expo-router';
import { CategorizeReview } from '@/components/categorize/CategorizeReview';

export default function CategorizeScreen() {
  return <CategorizeReview onDone={() => router.back()} />;
}
