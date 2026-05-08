import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';
import { secureStorage } from '@/services/secureStorage';

const SKIPPED_KEY = 'skippedUpdateVersion';

export function UpdatePrompt() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { status, check } = useAppVersionCheck();
  const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
  const [skippedLoaded, setSkippedLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    secureStorage
      .getItem(SKIPPED_KEY)
      .then((v) => {
        if (!cancelled) {
          setSkippedVersion(v);
          setSkippedLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSkippedLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!skippedLoaded || !check) return null;
  if (status === 'up-to-date' || status === 'unknown') return null;

  const isRequired = status === 'required';
  if (!isRequired && skippedVersion === check.latestVersion) return null;

  const notes = pickReleaseNotes(check.releaseNotes, i18n.language);

  async function onUpdate() {
    try {
      await Linking.openURL(check!.storeUrl);
    } catch {
      // best-effort; modal stays open
    }
  }

  async function onLater() {
    try {
      await secureStorage.setItem(SKIPPED_KEY, check!.latestVersion);
    } finally {
      setSkippedVersion(check!.latestVersion);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={isRequired ? () => {} : onLater}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {t(isRequired ? 'update.titleRequired' : 'update.titleAvailable')}
          </Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
            {t(isRequired ? 'update.bodyRequired' : 'update.bodyAvailable')}
          </Text>
          {notes ? (
            <View style={styles.notes}>
              <Text style={[styles.notesLabel, { color: theme.colors.textPrimary }]}>
                {t('update.releaseNotesLabel')}
              </Text>
              <ScrollView style={styles.notesScroll}>
                <Text style={{ color: theme.colors.textSecondary }}>{notes}</Text>
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.actions}>
            {!isRequired && (
              <Pressable
                onPress={onLater}
                style={styles.secondary}
                accessibilityRole="button"
                accessibilityLabel={t('update.actionLater')}
              >
                <Text style={{ color: theme.colors.textSecondary }}>{t('update.actionLater')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onUpdate}
              style={[styles.primary, { backgroundColor: theme.colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('update.actionUpdate')}
            >
              <Text style={styles.primaryText}>{t('update.actionUpdate')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function pickReleaseNotes(notes: Record<string, string> | null, locale: string): string | null {
  if (!notes) return null;
  const short = locale.split('-')[0];
  return notes[locale] ?? notes[short] ?? notes.en ?? null;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, marginBottom: 12 },
  notes: { marginBottom: 16 },
  notesLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  notesScroll: { maxHeight: 160 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  secondary: { paddingVertical: 10, paddingHorizontal: 16 },
  primary: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  primaryText: { color: 'white', fontWeight: '600' },
});
