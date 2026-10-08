/**
 * Cache cleanup for downloaded e-mail attachments (ABA-644 audit L6).
 */
const mockDelete = jest.fn();
const mockEntries: Array<{ uri: string }> = [];

jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    delete() {
      mockDelete(this.uri);
    }
  }
  class Directory {
    list() {
      return mockEntries.map((e) => Object.assign(new File(e.uri), {}));
    }
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('@/services/fileExport.utils', () => ({ blobToBase64: jest.fn() }), { virtual: true });

import { Platform } from 'react-native';
import { clearInboundDocumentCache, deleteInboundDocumentCache } from '../documentUri';

beforeEach(() => {
  mockDelete.mockClear();
  mockEntries.length = 0;
  mockEntries.push(
    { uri: 'file:///cache/inbound-abc.jpg' },
    { uri: 'file:///cache/inbound-abcd.png' },
    { uri: 'file:///cache/inbound-xyz.heic' },
    { uri: 'file:///cache/other.jpg' },
  );
  (Platform as { OS: string }).OS = 'android';
});

describe('deleteInboundDocumentCache', () => {
  // Catches: deleting a different item's file because ids share a prefix, or ignoring the extension.
  it('removes only that item, whatever its extension', () => {
    deleteInboundDocumentCache('abc');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/inbound-abc.jpg');
  });

  // Catches: the web build touching a file system that does not exist.
  it('is a no-op on web', () => {
    (Platform as { OS: string }).OS = 'web';
    deleteInboundDocumentCache('abc');
    clearInboundDocumentCache();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('clearInboundDocumentCache', () => {
  // Catches: leaving a previous user's receipts behind, or deleting unrelated cache files.
  it('removes every inbound-* file and nothing else', () => {
    clearInboundDocumentCache();
    expect(mockDelete).toHaveBeenCalledTimes(3);
    expect(mockDelete).not.toHaveBeenCalledWith('file:///cache/other.jpg');
  });

  // Catches: a cache failure breaking sign-out.
  it('never throws', () => {
    mockDelete.mockImplementation(() => {
      throw new Error('EACCES');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => clearInboundDocumentCache()).not.toThrow();
  });
});
