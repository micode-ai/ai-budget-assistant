import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { useCaptureSuggestionStore } from '@/stores/captureSuggestionStore';
import { captureOptionsFor, type CaptureOption } from '@/features/captureSuggestion/captureSuggestion';
import { trackAction } from '@/services/telemetry';

/**
 * State and handlers behind the one-time "faster ways to add expenses"
 * suggestion (ABA-682), shared by the phone sheet and the desktop dialog so
 * the two can never disagree on what counts as shown or as acted on.
 *
 * Telemetry: `started` when it appears, `completed` when an option is chosen;
 * a dismissal reports nothing and reads as `abandoned` on the funnel.
 */
export function useFasterCaptureSuggestion() {
  const isPending = useCaptureSuggestionStore((s) => s.isPending);
  const manualSaves = useCaptureSuggestionStore((s) => s.manualSaves);
  const markShown = useCaptureSuggestionStore((s) => s.markShown);
  const reported = useRef(false);

  useEffect(() => {
    if (isPending && !reported.current) {
      reported.current = true;
      trackAction('capture_suggestion', 'started');
    }
  }, [isPending]);

  const options = useMemo(() => captureOptionsFor(Platform.OS), []);

  const choose = useCallback(
    (option: CaptureOption) => {
      trackAction('capture_suggestion', 'completed');
      markShown();
      router.push(option.route as never);
    },
    [markShown],
  );

  return { visible: isPending, manualSaves, options, choose, dismiss: markShown };
}
