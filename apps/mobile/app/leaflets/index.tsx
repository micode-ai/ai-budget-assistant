import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { LeafletScreen } from '@/components/leaflets/LeafletScreen';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';

/**
 * `?source=share` comes from the share-sheet chooser (`useShareIntake`): the files themselves wait
 * in `shareIntakeStore.leafletFiles` — route params cannot carry file objects — and are taken
 * exactly once, on mount. From then on the leaflet session owns those cache copies and deletes
 * them. A second share while this screen is open goes through the chooser again and pushes a
 * fresh screen with its own files; this one keeps its rows.
 *
 * `?from=pick` (the shopping list's "check a leaflet") opens the gallery at once on a phone. Any
 * other way in (`?from=push` from the community promo push, a deep link) shows the idle state
 * with the account's active leaflets and never opens the picker by itself (R13/R14).
 */
export default function LeafletsRoute() {
  const { source, from } = useLocalSearchParams<{ source?: string; from?: string }>();
  const [files] = useState(() => (source === 'share' ? useShareIntakeStore.getState().takeFiles() : []));
  return files.length > 0 ? (
    <LeafletScreen files={files} source="share" />
  ) : (
    <LeafletScreen source="picker" autoPick={from === 'pick'} />
  );
}
