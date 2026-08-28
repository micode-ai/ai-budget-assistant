import * as ImageManipulator from 'expo-image-manipulator';
import { uriToBase64 } from '@/utils/fileBase64';

/**
 * Compresses a captured receipt photo and returns it as a base64 string,
 * ready to attach to the expense when the "save image" checkbox is on.
 * Extracted out of `app/expense/receipt.tsx` (ABA-448) with no change in
 * behavior.
 */
export async function compressAndEncodeImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
  );
  return await uriToBase64(result.uri);
}
