import {
  EMPTY_QUEUE, SHARE_QUEUE_MAX, enqueue, advance, current, position, remaining, isAcceptedMime,
  type SharedFile,
} from '../shareIntakeQueue';

const f = (name: string, mimeType = 'image/jpeg'): SharedFile => ({
  uri: `file:///cache/shared-intake/${name}`, mimeType, name, size: 1000,
});

describe('shareIntakeQueue', () => {
  it('accepts images and PDFs only', () => {
    expect(isAcceptedMime('image/png')).toBe(true);
    expect(isAcceptedMime('application/pdf')).toBe(true);
    expect(isAcceptedMime('text/plain')).toBe(false);
    expect(isAcceptedMime('')).toBe(false);
  });

  it('enqueues into an empty queue and reports position 1 of N', () => {
    const { queue, dropped } = enqueue(EMPTY_QUEUE, [f('a'), f('b')]);
    expect(dropped).toEqual([]);
    expect(current(queue)?.name).toBe('a');
    expect(position(queue)).toEqual({ n: 1, of: 2 });
  });

  it('drops unsupported MIME types', () => {
    const { queue, dropped } = enqueue(EMPTY_QUEUE, [f('a'), f('t', 'text/plain')]);
    expect(queue.files.map((x) => x.name)).toEqual(['a']);
    expect(dropped.map((x) => x.name)).toEqual(['t']);
  });

  it('caps the whole queue at SHARE_QUEUE_MAX across several shares', () => {
    const first = enqueue(EMPTY_QUEUE, Array.from({ length: 7 }, (_, i) => f(`a${i}`))).queue;
    const { queue, dropped } = enqueue(first, Array.from({ length: 5 }, (_, i) => f(`b${i}`)));
    expect(queue.total).toBe(SHARE_QUEUE_MAX);
    expect(dropped.map((x) => x.name)).toEqual(['b3', 'b4']);
  });

  it('enqueue appends to a non-empty queue without moving the current file', () => {
    const q1 = advance(enqueue(EMPTY_QUEUE, [f('a'), f('b')]).queue).queue; // now on b
    const q2 = enqueue(q1, [f('c')]).queue;
    expect(current(q2)?.name).toBe('b');
    expect(position(q2)).toEqual({ n: 2, of: 3 });
  });

  it('keeps two files with the same name', () => {
    const { queue } = enqueue(EMPTY_QUEUE, [f('same'), f('same')]);
    expect(queue.total).toBe(2);
  });

  it('advance returns the finished file and empties at the end', () => {
    let q = enqueue(EMPTY_QUEUE, [f('a'), f('b')]).queue;
    let r = advance(q);
    expect(r.finished?.name).toBe('a');
    q = r.queue;
    r = advance(q);
    expect(r.finished?.name).toBe('b');
    expect(r.queue).toEqual(EMPTY_QUEUE);
    expect(current(r.queue)).toBeNull();
    expect(position(r.queue)).toBeNull();
  });

  it('remaining lists the current file and everything after it', () => {
    const q = advance(enqueue(EMPTY_QUEUE, [f('a'), f('b'), f('c')]).queue).queue;
    expect(remaining(q).map((x) => x.name)).toEqual(['b', 'c']);
  });

  it('advance on an empty queue is a no-op', () => {
    expect(advance(EMPTY_QUEUE)).toEqual({ queue: EMPTY_QUEUE, finished: null });
  });
});
