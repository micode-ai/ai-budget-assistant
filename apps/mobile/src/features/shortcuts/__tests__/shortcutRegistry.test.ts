import {
  registerShortcut,
  unregisterShortcut,
  resolveShortcutHandler,
  subscribeShortcuts,
  getShortcutSnapshot,
  __resetShortcutRegistryForTests,
} from '../shortcutRegistry';

describe('shortcutRegistry', () => {
  beforeEach(() => {
    __resetShortcutRegistryForTests();
  });

  it('resolves no handler when nothing is registered for a combo', () => {
    expect(resolveShortcutHandler('n', false)).toBeNull();
  });

  it('resolves the registered handler for a matching combo', () => {
    const handler = jest.fn();
    registerShortcut({ combo: 'n', handler, allowInInput: false });
    const resolved = resolveShortcutHandler('n', false);
    expect(resolved?.handler).toBe(handler);
  });

  it('the most-recently-registered handler wins a shared combo', () => {
    const first = jest.fn();
    const second = jest.fn();
    registerShortcut({ combo: 'n', handler: first, allowInInput: false });
    registerShortcut({ combo: 'n', handler: second, allowInInput: false });
    expect(resolveShortcutHandler('n', false)?.handler).toBe(second);
  });

  it('unregistering restores the previous registration for that combo', () => {
    const first = jest.fn();
    const second = jest.fn();
    registerShortcut({ combo: 'n', handler: first, allowInInput: false });
    const secondId = registerShortcut({ combo: 'n', handler: second, allowInInput: false });
    unregisterShortcut(secondId);
    expect(resolveShortcutHandler('n', false)?.handler).toBe(first);
  });

  it('blocks a match on an editable target unless allowInInput is set', () => {
    const handler = jest.fn();
    registerShortcut({ combo: 'n', handler, allowInInput: false });
    expect(resolveShortcutHandler('n', true)).toBeNull();
  });

  it('an editable-target block does not fall through to an older registration', () => {
    const blocked = jest.fn();
    const older = jest.fn();
    registerShortcut({ combo: 'n', handler: older, allowInInput: true });
    registerShortcut({ combo: 'n', handler: blocked, allowInInput: false });
    // The most recent registration blocks the combo outright on an editable
    // target — it must NOT reveal the older, input-safe registration behind it.
    expect(resolveShortcutHandler('n', true)).toBeNull();
  });

  it('allowInInput lets a binding fire on an editable target', () => {
    const handler = jest.fn();
    registerShortcut({ combo: 'escape', handler, allowInInput: true });
    expect(resolveShortcutHandler('escape', true)?.handler).toBe(handler);
  });

  it('notifies subscribers on register and unregister', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeShortcuts(listener);
    const id = registerShortcut({ combo: 'n', handler: jest.fn(), allowInInput: false });
    expect(listener).toHaveBeenCalledTimes(1);
    unregisterShortcut(id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('returns a fresh array reference on every mutation, for useSyncExternalStore', () => {
    const before = getShortcutSnapshot();
    registerShortcut({ combo: 'n', handler: jest.fn(), allowInInput: false });
    const after = getShortcutSnapshot();
    expect(after).not.toBe(before);
  });

  it('returns the SAME array reference when nothing has changed', () => {
    registerShortcut({ combo: 'n', handler: jest.fn(), allowInInput: false });
    const a = getShortcutSnapshot();
    const b = getShortcutSnapshot();
    expect(a).toBe(b);
  });
});
