import { router, useLocalSearchParams } from 'expo-router';
import {
  IncomeCreateForm,
  type IncomeCreatePrefill,
} from '@/components/income/create/IncomeCreateForm';

export default function NewIncomeScreen() {
  const params = useLocalSearchParams<IncomeCreatePrefill>();

  return (
    <IncomeCreateForm
      initial={params}
      onDone={() => router.back()}
      onOpenVoice={() => {
        router.back();
        router.push('/income/voice');
      }}
      onOpenReceipt={() => {
        router.back();
        router.push('/income/receipt');
      }}
    />
  );
}
