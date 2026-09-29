import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ScanPriceTagResponse } from '@budget/shared-types';
import { api } from '@/services/api';
import i18n from '@/i18n';
import { showAlert } from '@/utils/alert';
import { uriToBase64 } from '@/utils/fileBase64';
import { downscaleForOcr } from '@/features/receipt/receiptImage';
import { capturePhoto, type CapturedPhoto } from '@/features/camera/capturePhoto';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { isEmptyPriceTag } from './priceTag';

export type PriceTagSource = 'camera' | 'gallery';

/**
 * Photographs (or picks) a shelf price tag and reads it through
 * `POST /ai/scan-price-tag`. Resolves to the reading, or null when the user
 * cancelled or anything failed — every failure is reported to the user here,
 * so callers only handle the success path.
 */
export function usePriceTagScan() {
  const [isScanning, setIsScanning] = useState(false);

  const scan = useCallback(async (source: PriceTagSource): Promise<ScanPriceTagResponse | null> => {
    let photo: CapturedPhoto | null = null;
    try {
      if (source === 'camera') {
        // capturePhoto shoots inside the page on web — the system camera app
        // lets Android discard the tab and lose the photo (ABA-624).
        const shot = await capturePhoto({
          shutter: i18n.t('shoppingList.takePhoto'),
          cancel: i18n.t('common.cancel'),
        });
        if (shot.status === 'denied') {
          showAlert(i18n.t('common.error'), i18n.t('errors.cameraPermissionDenied'));
          return null;
        }
        if (shot.status === 'cancelled') return null;
        photo = shot.photo;
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') {
          showAlert(i18n.t('common.error'), i18n.t('errors.galleryPermissionDenied'));
          return null;
        }
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (picked.canceled || !picked.assets[0]) return null;
        photo = { uri: picked.assets[0].uri, width: picked.assets[0].width };
      }

      setIsScanning(true);
      // Downscale before base64, same as a receipt — a full-resolution photo is
      // the memory spike Play's thresholds measure (docs/wiki/features/receipt-image-memory.md).
      const small = await downscaleForOcr(photo.uri, photo.width);
      const base64 = await uriToBase64(small);
      const tag = await api.scanPriceTag(base64);
      useSubscriptionStore.getState().loadUsage();
      if (isEmptyPriceTag(tag)) {
        showAlert(i18n.t('shoppingList.scanTagFailedTitle'), i18n.t('shoppingList.scanTagEmpty'));
        return null;
      }
      return tag;
    } catch (error) {
      if ((error as { status?: number }).status === 403) {
        useUpgradeStore.getState().show(i18n.t('subscription.limitReachedBody'), 'pro');
      } else {
        console.warn('Price tag scan failed:', error);
        showAlert(i18n.t('shoppingList.scanTagFailedTitle'), i18n.t('shoppingList.scanTagFailed'));
      }
      return null;
    } finally {
      setIsScanning(false);
      // The in-page web camera hands back a blob: URL; free it once read.
      if (Platform.OS === 'web' && photo?.uri.startsWith('blob:')) URL.revokeObjectURL(photo.uri);
    }
  }, []);

  return { scan, isScanning };
}
