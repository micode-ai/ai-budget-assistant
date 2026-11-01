import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  type KeyboardTypeOptions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useDeveloperAppsStore } from '@/stores/developerAppsStore';
import type { DeveloperApp } from '@/services/developerApps.api';
import {
  developerAppErrorKey,
  isAllowedRedirectUri,
  singleLine,
  isHttpsUrl,
  parseRedirectUris,
  MAX_APP_DESCRIPTION,
  MAX_APP_NAME,
  MAX_REDIRECT_URIS,
} from '@/features/developers/developerApps';

const TITLE_ID = 'developer-app-form-title';

interface Props {
  visible: boolean;
  /** Present when editing; absent when creating. */
  app: DeveloperApp | null;
  onClose: () => void;
}

interface FormState {
  name: string;
  description: string;
  homepageUrl: string;
  logoUrl: string;
  privacyPolicyUrl: string;
  redirectUris: string;
  isConfidential: boolean;
}

function initialForm(app: DeveloperApp | null): FormState {
  return {
    name: app?.name ?? '',
    description: app?.description ?? '',
    homepageUrl: app?.homepageUrl ?? '',
    logoUrl: app?.logoUrl ?? '',
    privacyPolicyUrl: app?.privacyPolicyUrl ?? '',
    redirectUris: app?.redirectUris.join('\n') ?? '',
    isConfidential: app?.isConfidential ?? true,
  };
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

/**
 * Create / edit a developer app. One `SheetDialog`: a bottom sheet on a phone (keyboard-avoiding,
 * `insets.bottom` handled by the wrapper — ABA-483), a centred dialog on desktop web.
 *
 * Validation here only mirrors the server's rules so the form can say WHICH field is wrong; the
 * server is authoritative. A create that returns a client secret closes this sheet, and
 * `DevelopersSettings` then shows `SecretRevealCard` from the store.
 */
export function AppFormSheet({ visible, app, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const isDesktop = useIsDesktopWeb();
  const { height } = useWindowDimensions();
  const [form, setForm] = useState<FormState>(() => initialForm(app));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = app !== null;

  // Re-seed whenever the sheet opens, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (visible) {
      setForm(initialForm(app));
      setErrors({});
      setSubmitError(null);
    }
  }, [visible, app]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!singleLine(form.name)) e.name = t('developerApps.form.nameRequired');
    if (!isHttpsUrl(form.homepageUrl)) e.homepageUrl = t('developerApps.form.httpsRequired');
    if (form.logoUrl.trim() && !isHttpsUrl(form.logoUrl)) e.logoUrl = t('developerApps.form.httpsRequired');
    if (form.privacyPolicyUrl.trim() && !isHttpsUrl(form.privacyPolicyUrl)) {
      e.privacyPolicyUrl = t('developerApps.form.httpsRequired');
    }
    const uris = parseRedirectUris(form.redirectUris);
    const bad = uris.find((u) => !isAllowedRedirectUri(u));
    if (uris.length === 0) e.redirectUris = t('developerApps.form.redirectRequired');
    else if (uris.length > MAX_REDIRECT_URIS) {
      e.redirectUris = t('developerApps.form.redirectTooMany', { max: MAX_REDIRECT_URIS });
    } else if (bad) e.redirectUris = t('developerApps.form.redirectInvalid', { uri: bad });
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    setSubmitError(null);
    const store = useDeveloperAppsStore.getState();
    const name = singleLine(form.name);
    const description = singleLine(form.description);
    const logoUrl = form.logoUrl.trim();
    const privacyPolicyUrl = form.privacyPolicyUrl.trim();
    try {
      if (app) {
        await store.updateApp(app.id, {
          name,
          homepageUrl: form.homepageUrl.trim(),
          redirectUris: parseRedirectUris(form.redirectUris),
          // `null` clears an optional field; an empty string would fail the server's URL check.
          description: description || null,
          logoUrl: logoUrl || null,
          privacyPolicyUrl: privacyPolicyUrl || null,
        });
      } else {
        await store.createApp({
          name,
          homepageUrl: form.homepageUrl.trim(),
          redirectUris: parseRedirectUris(form.redirectUris),
          isConfidential: form.isConfidential,
          ...(description ? { description } : {}),
          ...(logoUrl ? { logoUrl } : {}),
          ...(privacyPolicyUrl ? { privacyPolicyUrl } : {}),
        });
      }
      onClose();
    } catch (err) {
      setSubmitError(t(developerAppErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: 'name' | 'description' | 'homepageUrl' | 'logoUrl' | 'privacyPolicyUrl' | 'redirectUris',
    label: string,
    opts: { multiline?: boolean; keyboardType?: KeyboardTypeOptions; maxLength?: number; hint?: string; placeholder?: string } = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.label} nativeID={`dev-app-${key}`}>
        {label}
      </Text>
      <TextInput
        style={[styles.input, opts.multiline && styles.multiline, errors[key] ? styles.inputError : null]}
        value={form[key]}
        onChangeText={(v) => set(key, v)}
        placeholder={opts.placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        multiline={opts.multiline}
        keyboardType={opts.keyboardType}
        maxLength={opts.maxLength}
        autoCapitalize={key === 'name' || key === 'description' ? 'sentences' : 'none'}
        autoCorrect={key === 'name' || key === 'description'}
        editable={!busy}
        aria-labelledby={`dev-app-${key}`}
      />
      {opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}
      {errors[key] ? <Text style={styles.errorText}>{errors[key]}</Text> : null}
    </View>
  );

  const typeOption = (confidential: boolean) => {
    const selected = form.isConfidential === confidential;
    return (
      <TouchableOpacity
        key={String(confidential)}
        style={[styles.typeOption, selected && styles.typeOptionSelected]}
        onPress={() => set('isConfidential', confidential)}
        disabled={busy}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
      >
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          size={20}
          color={selected ? theme.colors.primary : theme.colors.textTertiary}
        />
        <View style={styles.typeTextCol}>
          <Text style={styles.typeTitle}>
            {t(confidential ? 'developerApps.typeConfidential' : 'developerApps.typePublic')}
          </Text>
          <Text style={styles.hint}>
            {t(confidential ? 'developerApps.form.typeConfidentialHint' : 'developerApps.form.typePublicHint')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SheetDialog
      visible={visible}
      onClose={busy ? () => undefined : onClose}
      titleId={TITLE_ID}
      keyboardAvoiding
      desktopScroll={false}
    >
      <Text nativeID={TITLE_ID} style={[styles.title, isDesktop && styles.titleDesktop]} accessibilityRole="header">
        {editing ? t('developerApps.form.editTitle') : t('developerApps.form.createTitle')}
      </Text>
      <ScrollView
        style={isDesktop ? styles.desktopScroll : { maxHeight: Math.round(height * 0.65) }}
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        keyboardShouldPersistTaps="handled"
      >
        {field('name', t('developerApps.form.name'), { maxLength: MAX_APP_NAME })}
        {field('description', t('developerApps.form.description'), { multiline: true, maxLength: MAX_APP_DESCRIPTION })}
        {field('homepageUrl', t('developerApps.form.homepageUrl'), { keyboardType: 'url', placeholder: 'https://' })}
        {field('redirectUris', t('developerApps.form.redirectUris'), {
          multiline: true,
          keyboardType: 'url',
          placeholder: 'https://example.com/oauth/callback',
          hint: t('developerApps.form.redirectUrisHint'),
        })}
        {field('logoUrl', t('developerApps.form.logoUrl'), { keyboardType: 'url', placeholder: 'https://' })}
        {field('privacyPolicyUrl', t('developerApps.form.privacyPolicyUrl'), { keyboardType: 'url', placeholder: 'https://' })}

        <View style={styles.field}>
          <Text style={styles.label}>{t('developerApps.form.type')}</Text>
          {editing ? (
            <>
              <Text style={styles.typeTitle}>
                {t(form.isConfidential ? 'developerApps.typeConfidential' : 'developerApps.typePublic')}
              </Text>
              <Text style={styles.hint}>{t('developerApps.form.typeFixed')}</Text>
            </>
          ) : (
            <View style={styles.typeGroup} accessibilityRole="radiogroup">
              {typeOption(true)}
              {typeOption(false)}
            </View>
          )}
        </View>

        {submitError ? (
          <Text style={styles.submitError} accessibilityLiveRegion="polite">
            {submitError}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={busy} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.primaryText}>{editing ? t('common.save') : t('developerApps.form.create')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  titleDesktop: { paddingHorizontal: theme.spacing[5], paddingTop: theme.spacing[5], marginBottom: 0 },
  desktopScroll: { flexShrink: 1 },
  content: { gap: theme.spacing[4], paddingBottom: theme.spacing[2] },
  contentDesktop: { padding: theme.spacing[5] },
  field: { gap: theme.spacing[1.5] },
  label: { ...theme.textStyles.label, color: theme.colors.textTertiary },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' as const },
  inputError: { borderColor: theme.colors.danger },
  hint: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  errorText: { ...theme.textStyles.bodySm, color: theme.colors.danger },
  typeGroup: { gap: theme.spacing[2] },
  typeOption: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeOptionSelected: { borderColor: theme.colors.primary },
  typeTextCol: { flex: 1, gap: theme.spacing[0.5] },
  typeTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  submitError: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[2] },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  cancelText: { ...theme.textStyles.button, color: theme.colors.textPrimary },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  primaryText: { ...theme.textStyles.button, color: theme.colors.textInverse },
  disabled: { opacity: 0.6 },
});
