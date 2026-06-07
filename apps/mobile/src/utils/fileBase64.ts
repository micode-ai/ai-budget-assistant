import { Platform } from 'react-native';
import { File } from 'expo-file-system/next';

// Read a file URI as a base64 string (no data-URL prefix), cross-platform.
//
// On native we use expo-file-system's `File.base64()`. On web that class is not
// implemented (its internal `validatePath` is missing → "this.validatePath is
// not a function"), and recorded/picked URIs are `blob:`/`data:` URLs anyway,
// so we fetch the URI and decode it with FileReader.
export async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return blobToBase64(blob);
  }
  const file = new File(uri);
  return file.base64();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      // `result` is a data URL ("data:<mime>;base64,XXXX") — strip the prefix.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}
