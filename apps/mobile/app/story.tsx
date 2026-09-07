import { useLocalSearchParams } from 'expo-router';
import { SpendingStoryView, type SpendingStoryPrefill } from '@/components/story/SpendingStoryView';

export default function StoryScreen() {
  const params = useLocalSearchParams<SpendingStoryPrefill>();

  return <SpendingStoryView initial={params} />;
}
