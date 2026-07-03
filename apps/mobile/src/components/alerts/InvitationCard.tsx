import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import type { MyInvitation } from '@/services/accounts.api';

interface Props {
  invitation: MyInvitation;
  onAccept: () => void;
  onDecline: () => void;
}

export function InvitationCard({ invitation, onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderLight }]}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
        {t('alerts.invitationTitle', { accountName: invitation.accountName })}
      </Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {t('alerts.invitationSubtitle', { inviterName: invitation.inviterName, role: t(`accounts.roles.${invitation.role}`) })}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.declineButton, { borderColor: theme.colors.border }]}
          onPress={onDecline}
        >
          <Text style={{ color: theme.colors.textSecondary }}>{t('alerts.invitationDecline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton, { backgroundColor: theme.colors.primary }]}
          onPress={onAccept}
        >
          <Text style={{ color: theme.colors.textInverse }}>{t('alerts.invitationAccept')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  declineButton: { borderWidth: 1 },
  acceptButton: {},
});
