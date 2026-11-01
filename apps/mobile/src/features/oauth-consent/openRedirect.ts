import { Linking, Platform } from 'react-native';

/**
 * Leaves the app for the third party's redirect. The URL is ALWAYS the server's `redirectTo` —
 * the server built it only after `redirect_uri` matched a registered URI exactly. Never call this
 * with anything assembled on the client from the query string.
 */
export async function openRedirect(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}
