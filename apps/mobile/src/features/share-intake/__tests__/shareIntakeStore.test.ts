import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import type { SharedFile } from '../shareIntakeQueue';

const f = (name: string, mimeType = 'image/jpeg'): SharedFile => ({ uri: `file:///c/${name}`, mimeType, name, size: 1 });

beforeEach(() => useShareIntakeStore.getState().reset());

describe('shareIntakeStore', () => {
  it('add queues files, flags navigation and counts native + queue drops', () => {
    useShareIntakeStore.getState().add([f('a'), f('t', 'text/plain')], 2);
    const s = useShareIntakeStore.getState();
    expect(s.queue.total).toBe(1);
    expect(s.pendingNavigation).toBe(true);
    expect(s.lastDropped).toBe(3);
  });

  it('add with nothing accepted does not flag navigation', () => {
    useShareIntakeStore.getState().add([f('t', 'text/plain')], 0);
    expect(useShareIntakeStore.getState().pendingNavigation).toBe(false);
  });

  it('next advances and returns the finished file', () => {
    useShareIntakeStore.getState().add([f('a'), f('b')], 0);
    expect(useShareIntakeStore.getState().next()?.name).toBe('a');
    expect(useShareIntakeStore.getState().queue.index).toBe(1);
  });

  it('discardAll returns unprocessed files and empties the queue', () => {
    useShareIntakeStore.getState().add([f('a'), f('b'), f('c')], 0);
    useShareIntakeStore.getState().next();
    expect(useShareIntakeStore.getState().discardAll().map((x) => x.name)).toEqual(['b', 'c']);
    expect(useShareIntakeStore.getState().queue.total).toBe(0);
  });

  it('reset clears everything', () => {
    useShareIntakeStore.getState().add([f('a')], 1);
    useShareIntakeStore.getState().setScreenOpen(true);
    useShareIntakeStore.getState().reset();
    const s = useShareIntakeStore.getState();
    expect(s.queue.total).toBe(0);
    expect(s.pendingNavigation).toBe(false);
    expect(s.lastDropped).toBe(0);
    expect(s.screenOpen).toBe(false);
  });
});
