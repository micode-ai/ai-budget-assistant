import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EmailReceiptsInboxScreen } from '@/components/inboundMail/EmailReceiptsInboxScreen';

export default function EmailReceiptConfirmScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Desktop opens the inbox with this item's confirm dialog over it; the phone keeps the full-screen card.
  return <EmailReceiptsInboxScreen openId={String(id ?? '')} />;
}
