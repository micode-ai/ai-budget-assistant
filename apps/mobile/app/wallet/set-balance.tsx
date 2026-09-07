import { router, useLocalSearchParams } from 'expo-router';
import { SetBalanceView } from '@/components/wallet/SetBalanceView';

export default function SetBalanceScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  return (
    <SetBalanceView
      editId={editId}
      onEditIdChange={(next) => router.setParams({ editId: next })}
      onDone={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.setParams({ editId: '' });
        }
      }}
    />
  );
}
