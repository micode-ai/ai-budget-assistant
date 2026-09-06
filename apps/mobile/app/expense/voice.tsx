import { router } from 'expo-router';
import { VoiceExpenseView } from '@/components/voice/VoiceExpenseView';

export default function VoiceExpenseScreen() {
  return <VoiceExpenseView onDone={() => router.back()} />;
}
