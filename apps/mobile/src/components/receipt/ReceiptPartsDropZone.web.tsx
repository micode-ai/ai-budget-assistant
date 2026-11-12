import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useIsDesktopWeb } from '@/components/webLayout.constants';

interface Props {
  disabled: boolean;
  /**
   * Object URLs of the dropped images, in drop order. Resolves with the URLs
   * no part holds (a part whose downscale failed keeps the original URL).
   */
  onDropUris: (uris: string[]) => Promise<string[]>;
}

/**
 * Desktop web (>= 1024): drop receipt photos here to add them as parts, in the
 * order dropped. Below 1024 it draws nothing, like the native sibling. Object
 * URLs are revoked once the parts have been downscaled, except one a part still
 * holds because its downscale failed. React Native Web's View does not forward drag events,
 * so the listeners sit on the DOM node, as in `LeafletDesktop`.
 */
export default function ReceiptPartsDropZone({ disabled, onDropUris }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const isDesktop = useIsDesktopWeb();
  const rootRef = useRef<View>(null);
  const [dragOver, setDragOver] = useState(false);
  const latest = useRef({ disabled, onDropUris });
  latest.current = { disabled, onDropUris };

  useEffect(() => {
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!isDesktop || !node || typeof node.addEventListener !== 'function') return undefined;
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setDragOver(true);
    };
    const leave = (e: DragEvent) => {
      if (e.target === node || !node.contains(e.relatedTarget as Node | null)) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (latest.current.disabled || !e.dataTransfer?.files) return;
      const uris = Array.from(e.dataTransfer.files)
        .filter((f) => f.type.startsWith('image/'))
        .map((f) => URL.createObjectURL(f));
      if (uris.length === 0) return;
      // Revoke only what no part holds: a part whose downscale failed renders
      // and is read from the original object URL. A failed add revokes nothing.
      void latest.current
        .onDropUris(uris)
        .then((revocable) => revocable.forEach((u) => URL.revokeObjectURL(u)))
        .catch((err) => console.warn('[ReceiptPartsDropZone] drop not added:', err));
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [isDesktop]);

  if (!isDesktop) return null;

  return (
    <View ref={rootRef} style={[styles.zone, dragOver && styles.zoneActive]}>
      <Ionicons name="cloud-upload-outline" size={28} color={dragOver ? theme.colors.primary : theme.colors.textTertiary} />
      <Text style={styles.text}>{dragOver ? t('receipt.partsDropActive') : t('receipt.partsDrop')}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  zone: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[6],
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  zoneActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  text: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
});
