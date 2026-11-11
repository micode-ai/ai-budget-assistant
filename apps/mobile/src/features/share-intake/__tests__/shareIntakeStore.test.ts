import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { deleteSharedFile } from '@/services/shareIntake';
import type { SharedFile } from '../shareIntakeQueue';

const f = (name: string, mimeType = 'image/jpeg'): SharedFile => ({ uri: `file:///c/${name}`, mimeType, name, size: 1 });

jest.mock('@/services/shareIntake', () => ({ deleteSharedFile: jest.fn(() => Promise.resolve()) }));

beforeEach(() => {
  useShareIntakeStore.getState().reset();
  jest.mocked(deleteSharedFile).mockClear();
});

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

  it('handOffToLeaflets moves the unprocessed files out of the queue; takeFiles returns them once', () => {
    useShareIntakeStore.getState().add([f('a'), f('b')], 0);
    const handed = useShareIntakeStore.getState().handOffToLeaflets();
    expect(handed).toBe(2);
    expect(useShareIntakeStore.getState().queue.total).toBe(0);
    expect(useShareIntakeStore.getState().takeFiles().map((x) => x.name)).toEqual(['a', 'b']);
    expect(useShareIntakeStore.getState().takeFiles()).toEqual([]);
  });

  it('a second hand-off before the screen took the first appends, never overwrites', () => {
    useShareIntakeStore.getState().add([f('a')], 0);
    useShareIntakeStore.getState().handOffToLeaflets();
    useShareIntakeStore.getState().add([f('b')], 0);
    useShareIntakeStore.getState().handOffToLeaflets();
    expect(useShareIntakeStore.getState().takeFiles().map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('reset deletes cache copies handed to the leaflet screen but never taken', () => {
    useShareIntakeStore.getState().add([f('a')], 0);
    useShareIntakeStore.getState().handOffToLeaflets();
    useShareIntakeStore.getState().reset();
    expect(deleteSharedFile).toHaveBeenCalledWith('file:///c/a');
    expect(useShareIntakeStore.getState().takeFiles()).toEqual([]);
  });
});
