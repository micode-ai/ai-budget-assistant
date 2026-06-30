import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme } from '@/theme';
import type { VoteChoice } from '@budget/shared-types';

const VOTE_ICONS: Record<VoteChoice, string> = {
  APPROVE: '✅',
  REJECT: '❌',
  ABSTAIN: '⚪',
};

export default function PurchaseRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const userId = useAuthStore(s => s.user?.id);
  const accountRole = useAccountStore(s => s.currentAccount()?.myRole ?? 'viewer');
  const { requests, loadRequests, vote, convertToPlanned, cancelRequest } = usePurchaseRequestStore();
  const [comment, setComment] = useState('');
  const [isActing, setIsActing] = useState(false);

  useEffect(() => { loadRequests(); }, []);

  const pr = id ? requests.find(r => r.id === id) : undefined;

  if (!pr) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const myVote = pr.votes?.find(v => v.userId === userId);
  const approveCount = pr.votes?.filter(v => v.vote === 'APPROVE').length ?? 0;
  const rejectCount = pr.votes?.filter(v => v.vote === 'REJECT').length ?? 0;
  const totalVotes = pr.votes?.length ?? 0;

  const canCancel = (pr.createdByUserId === userId || accountRole === 'owner') && pr.status === 'PENDING';
  const canVote = pr.status === 'PENDING' && !myVote;
  const canConvert = pr.status === 'APPROVED' && !pr.plannedExpenseId;

  const handleVote = async (v: VoteChoice) => {
    setIsActing(true);
    try {
      await vote(pr.id, { vote: v, comment: comment.trim() || undefined });
      setComment('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to vote';
      Alert.alert('Error', message);
    } finally {
      setIsActing(false);
    }
  };

  const handleConvert = async () => {
    setIsActing(true);
    try {
      const expenseId = await convertToPlanned(pr.id);
      Alert.alert(t('purchaseRequests.convertSuccess'), '', [
        { text: 'OK', onPress: () => router.push(`/expense/${expenseId}`) },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to convert';
      Alert.alert('Error', message);
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(t('purchaseRequests.cancelRequest'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: () => {
          router.back();
          cancelRequest(pr.id).catch(() => {});
        },
      },
    ]);
  };

  const statusColor = (status: string): string => {
    if (status === 'APPROVED') return '#10B981';
    if (status === 'REJECTED') return '#EF4444';
    if (status === 'PENDING') return '#F59E0B';
    return theme.colors.textSecondary;
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{pr.title}</Text>
          <Text style={[styles.statusBadge, { color: statusColor(pr.status) }]}>
            {t(`purchaseRequests.${pr.status.toLowerCase()}`)}
          </Text>
        </View>
        <Text style={[styles.amount, { color: theme.colors.primary }]}>
          {pr.amount.toFixed(2)} {pr.currency}
        </Text>
        {pr.merchant ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{pr.merchant}</Text>
        ) : null}
        {pr.description ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{pr.description}</Text>
        ) : null}
        {pr.createdByUserName ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            {pr.createdByUserName}
          </Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
          {t('purchaseRequests.votes')} · {approveCount} ✅  {rejectCount} ❌
        </Text>
        {pr.votes?.map(v => (
          <View key={v.id} style={styles.voteRow}>
            <Text style={{ fontSize: 16 }}>{VOTE_ICONS[v.vote as VoteChoice]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.voterName, { color: theme.colors.textPrimary }]}>{v.userName}</Text>
              {v.comment ? (
                <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>{v.comment}</Text>
              ) : null}
            </View>
          </View>
        ))}
        {totalVotes === 0 ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.noRequests')}
          </Text>
        ) : null}
      </View>

      {canVote ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
            {t('purchaseRequests.yourVote')}
          </Text>
          <TextInput
            style={[styles.commentInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
            value={comment}
            onChangeText={setComment}
            placeholder={t('purchaseRequests.voteComment')}
            placeholderTextColor={theme.colors.textSecondary}
          />
          <View style={styles.voteButtons}>
            {(['APPROVE', 'REJECT', 'ABSTAIN'] as VoteChoice[]).map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.voteBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                onPress={() => handleVote(v)}
                disabled={isActing}
              >
                <Text style={{ fontSize: 20 }}>{VOTE_ICONS[v]}</Text>
                <Text style={[styles.voteBtnLabel, { color: theme.colors.textPrimary }]}>
                  {t(`purchaseRequests.${v.toLowerCase()}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {myVote ? (
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            {t('purchaseRequests.yourVote')}: {VOTE_ICONS[myVote.vote as VoteChoice]} {t(`purchaseRequests.${myVote.vote.toLowerCase()}`)}
          </Text>
        </View>
      ) : null}

      {canConvert ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: theme.colors.primary }]}
          onPress={handleConvert}
          disabled={isActing}
        >
          <Text style={styles.actionBtnText}>{t('purchaseRequests.addToPlan')}</Text>
        </TouchableOpacity>
      ) : null}

      {canCancel ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
          onPress={handleCancel}
        >
          <Text style={styles.actionBtnText}>{t('purchaseRequests.cancelRequest')}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  amount: { fontSize: 28, fontWeight: '800' },
  meta: { fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  voteRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
  voterName: { fontSize: 14, fontWeight: '500' },
  commentInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, marginBottom: 8 },
  voteButtons: { flexDirection: 'row', gap: 8 },
  voteBtn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, gap: 4 },
  voteBtnLabel: { fontSize: 12, fontWeight: '500' },
  actionBtn: { borderRadius: 12, padding: 16, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
