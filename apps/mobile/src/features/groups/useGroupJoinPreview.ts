import { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { JoinPreviewState } from './groupJoin';

/** Fetches the join preview whenever the token changes; `reload` re-fetches (e.g. after MEMBER_TAKEN). */
export function useGroupJoinPreview(token: string | null) {
  const [state, setState] = useState<JoinPreviewState>({ status: 'idle' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!token) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    api
      .previewGroupJoin(token)
      .then((preview) => {
        if (!cancelled) setState({ status: 'ready', preview });
      })
      .catch((e: { status?: number }) => {
        if (!cancelled) setState({ status: e?.status === 404 ? 'notFound' : 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
