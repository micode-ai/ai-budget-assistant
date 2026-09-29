import * as ImagePicker from 'expo-image-picker';

export interface CapturedPhoto {
  uri: string;
  width?: number;
}

export interface CapturePhotoLabels {
  shutter: string;
  cancel: string;
}

export type CapturePhotoResult =
  | { status: 'captured'; photo: CapturedPhoto }
  | { status: 'cancelled' }
  | { status: 'denied' };

/**
 * Takes one photo with the camera. Native: the system camera via
 * expo-image-picker. The web sibling (`capturePhoto.web.ts`) shoots inside the
 * page instead — see there for why.
 */
export async function capturePhoto(_labels: CapturePhotoLabels): Promise<CapturePhotoResult> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return { status: 'denied' };
  const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (picked.canceled || !picked.assets[0]) return { status: 'cancelled' };
  return { status: 'captured', photo: { uri: picked.assets[0].uri, width: picked.assets[0].width } };
}
