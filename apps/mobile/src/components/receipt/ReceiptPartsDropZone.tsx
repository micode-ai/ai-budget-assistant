interface Props {
  disabled: boolean;
  /**
   * Object URLs of the dropped images, in drop order. Resolves with the URLs
   * no part holds (a part whose downscale failed keeps the original URL).
   */
  onDropUris: (uris: string[]) => Promise<string[]>;
}

/**
 * Native: nothing — a phone has no drag and drop. The desktop web drop target
 * is `ReceiptPartsDropZone.web.tsx`.
 */
export default function ReceiptPartsDropZone(_props: Props) {
  return null;
}
