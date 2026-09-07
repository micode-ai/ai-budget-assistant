import React from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAlertDialogStore } from '@/stores/alertDialogStore';

/**
 * Renders `showAlert` on web as a themed in-app dialog instead of the
 * browser's `window.alert`/`window.confirm`.
 *
 * Two reasons this is not cosmetic. A browser confirm is a synchronous,
 * renderer-blocking dialog — it freezes the whole tab, which is both a worse
 * experience and something automation cannot dismiss. And it renders in the
 * browser's own chrome, so it ignores the app's theme and its 13 accents
 * entirely.
 *
 * Mounted once, next to `UpgradeGate` in `app/_layout.tsx`. Native renders
 * nothing: `Alert.alert` is the right dialog there, and `showAlert` still
 * delegates to it.
 */
export function AlertDialogHost() {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const pending = useAlertDialogStore((s) => s.pending);
  const dismiss = useAlertDialogStore((s) => s.dismiss);

  if (Platform.OS !== 'web' || !pending) return null;

  const { title, message, buttons } = pending;
  // A native alert with no buttons still gets an implicit OK, so mirror that
  // rather than rendering a dialog the user cannot close.
  const resolved = buttons.length > 0 ? buttons : [{ text: 'OK' }];
  const cancelButton = resolved.find((b) => b.style === 'cancel');

  const run = (onPress?: () => void) => {
    // Dismiss FIRST: a handler that opens another alert (a delete confirmation
    // reporting a failure, say) would otherwise be wiped by this dismiss.
    dismiss();
    onPress?.();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Esc on web, and the hardware back button on Android if this ever runs
      // there — both mean "cancel", so they take the cancel button's action
      // when there is one.
      onRequestClose={() => run(cancelButton?.onPress)}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropFill}
          onPress={() => run(cancelButton?.onPress)}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View
          role="dialog"
          aria-modal
          style={[styles.panel, { marginBottom: insets.bottom }]}
        >
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            {resolved.map((b, i) => {
              const destructive = b.style === 'destructive';
              const cancel = b.style === 'cancel';
              return (
                <Pressable
                  key={`${b.text ?? i}-${i}`}
                  onPress={() => run(b.onPress)}
                  accessibilityRole="button"
                  style={[
                    styles.button,
                    cancel && styles.buttonCancel,
                    destructive && { backgroundColor: theme.colors.danger },
                    !cancel && !destructive && { backgroundColor: theme.colors.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      cancel
                        ? { color: theme.colors.textSecondary }
                        : // Always-white on a semantic fill: `textInverse` is
                          // accent-derived and would follow a green accent onto
                          // the red danger button.
                          { color: theme.colors.onSemantic },
                    ]}
                  >
                    {b.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    backgroundColor: theme.colors.overlay,
  },
  backdropFill: {
    ...({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const),
  },
  panel: {
    width: '100%' as const,
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  message: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  button: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    minWidth: 96,
    alignItems: 'center' as const,
  },
  buttonCancel: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  buttonText: {
    ...theme.textStyles.button,
  },
});
