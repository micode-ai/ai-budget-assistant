import * as ImagePicker from 'expo-image-picker';
import type { CapturePhotoLabels, CapturePhotoResult } from './capturePhoto';

export type { CapturedPhoto, CapturePhotoLabels, CapturePhotoResult } from './capturePhoto';

/**
 * Web: shoots INSIDE the page with getUserMedia instead of an
 * `<input capture>`. On Android, `<input capture>` hands off to the separate
 * camera app; while it is in front, Chrome may discard the backgrounded tab to
 * free memory, and on return it reloads the page — the photo is lost and no
 * request is ever sent. Seen in production on the price-tag scan (ABA-624): a
 * full page reload and a fresh session ~12 s after opening the camera, twice.
 * Staying in the page leaves nothing to discard.
 *
 * Falls back to the `<input capture>` path when the browser has no camera API
 * (insecure context, old browser) — a camera that may lose the photo beats no
 * camera. A user who DENIES camera access gets 'denied', not the fallback.
 */
export async function capturePhoto(labels: CapturePhotoLabels): Promise<CapturePhotoResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return fallbackCapture();
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { status: 'denied' };
    // No camera device, or it is busy: let the system picker try.
    return fallbackCapture();
  }
  return shootInPage(stream, labels);
}

async function fallbackCapture(): Promise<CapturePhotoResult> {
  const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (picked.canceled || !picked.assets[0]) return { status: 'cancelled' };
  return { status: 'captured', photo: { uri: picked.assets[0].uri, width: picked.assets[0].width } };
}

function button(label: string, primary: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-label', label);
  Object.assign(b.style, {
    font: '600 16px system-ui, sans-serif',
    padding: primary ? '0' : '12px 20px',
    border: primary ? '4px solid #fff' : 'none',
    borderRadius: primary ? '50%' : '8px',
    width: primary ? '72px' : 'auto',
    height: primary ? '72px' : 'auto',
    background: primary ? '#E37F2B' : 'rgba(255,255,255,0.15)',
    color: '#fff',
    cursor: 'pointer',
  } as Partial<CSSStyleDeclaration>);
  if (primary) b.textContent = '';
  return b;
}

function shootInPage(stream: MediaStream, labels: CapturePhotoLabels): Promise<CapturePhotoResult> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
    } as Partial<CSSStyleDeclaration>);

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.setAttribute('playsinline', 'true');
    video.srcObject = stream;
    Object.assign(video.style, { flex: '1', width: '100%', minHeight: '0', objectFit: 'contain' });

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 24px calc(16px + env(safe-area-inset-bottom))',
    } as Partial<CSSStyleDeclaration>);
    const cancel = button(labels.cancel, false);
    const shutter = button(labels.shutter, true);
    const spacer = document.createElement('div');
    spacer.style.width = `${cancel.offsetWidth || 90}px`;
    bar.append(cancel, shutter, spacer);
    overlay.append(video, bar);
    document.body.appendChild(overlay);

    let done = false;
    const finish = (result: CapturePhotoResult) => {
      if (done) return;
      done = true;
      stream.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish({ status: 'cancelled' });
    };
    document.addEventListener('keydown', onKey);
    cancel.addEventListener('click', () => finish({ status: 'cancelled' }));
    shutter.addEventListener('click', () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return; // not streaming yet — ignore the tap
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return finish({ status: 'cancelled' });
          finish({ status: 'captured', photo: { uri: URL.createObjectURL(blob), width: w } });
        },
        'image/jpeg',
        0.9,
      );
    });
    shutter.focus();
  });
}
