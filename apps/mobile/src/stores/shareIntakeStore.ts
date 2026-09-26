import { create } from 'zustand';
import {
  EMPTY_QUEUE, enqueue, advance, remaining, type ShareQueue, type SharedFile,
} from '@/features/share-intake/shareIntakeQueue';

interface ShareIntakeState {
  queue: ShareQueue;
  /** Files dropped by add() (cap/MIME/native limits) — shown once, then cleared by the view. */
  lastDropped: number;
  /** Set when a queue arrives; the root `useShareIntake` hook consumes it. */
  pendingNavigation: boolean;
  /** True while `expense/receipt?source=share` is mounted — the root hook stays idle then. */
  screenOpen: boolean;
  add: (files: SharedFile[], nativeDropped: number) => void;
  /** Advances; returns the finished file. */
  next: () => SharedFile | null;
  /** Returns everything not yet processed and empties the queue. */
  discardAll: () => SharedFile[];
  consumeNavigation: () => void;
  clearDropped: () => void;
  setScreenOpen: (open: boolean) => void;
  reset: () => void;
}

/**
 * In-memory only, deliberately (spec: a queue lost to process death is re-shared,
 * persisting it is not worth the complexity). Reset on sign-out.
 */
export const useShareIntakeStore = create<ShareIntakeState>((set, get) => ({
  queue: EMPTY_QUEUE,
  lastDropped: 0,
  pendingNavigation: false,
  screenOpen: false,
  add: (files, nativeDropped) => {
    const before = get().queue;
    const { queue, dropped } = enqueue(before, files);
    const accepted = queue !== before;
    set((s) => ({
      queue,
      lastDropped: s.lastDropped + nativeDropped + dropped.length,
      pendingNavigation: s.pendingNavigation || accepted,
    }));
  },
  next: () => {
    const { queue, finished } = advance(get().queue);
    set({ queue });
    return finished;
  },
  discardAll: () => {
    const left = remaining(get().queue);
    set({ queue: EMPTY_QUEUE });
    return left;
  },
  consumeNavigation: () => set({ pendingNavigation: false }),
  clearDropped: () => set({ lastDropped: 0 }),
  setScreenOpen: (screenOpen) => set({ screenOpen }),
  reset: () => set({ queue: EMPTY_QUEUE, lastDropped: 0, pendingNavigation: false, screenOpen: false }),
}));
