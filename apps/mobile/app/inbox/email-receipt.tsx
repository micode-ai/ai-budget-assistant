import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EmailReceiptConfirm } from '@/components/inboundMail/EmailReceiptConfirm';

export default function EmailReceiptConfirmScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <EmailReceiptConfirm id={String(id ?? '')} />;
}
