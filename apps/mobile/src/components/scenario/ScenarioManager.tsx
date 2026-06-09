import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useScenarioStore, type SavedScenario } from '@/stores/scenarioStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import type { ExtraIncome } from '@/features/scenario/useScenarioProjection';

interface ScenarioManagerProps {
  expenseAdj: Record<string, number>;
  incomeAdj: Record<string, number>;
  extraIncomes: ExtraIncome[];
  horizon: 3 | 6 | 12;
  onLoad: (scenario: SavedScenario) => void;
}

export function ScenarioManager({
  expenseAdj,
  incomeAdj,
  extraIncomes,
  horizon,
  onLoad,
}: ScenarioManagerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const isPro = useSubscriptionStore(s => s.isPro());
  const { scenarios, saveScenario, deleteScenario, canSave } = useScenarioStore();

  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [loadModalVisible, setLoadModalVisible] = useState(false);

  const handleSavePress = useCallback(() => {
    if (!canSave(isPro)) {
      showAlert(t('scenarioSimulator.savedScenarios'), t('scenarioSimulator.scenarioLimitFree'));
      return;
    }
    setScenarioName('');
    setSaveModalVisible(true);
  }, [canSave, isPro, t]);

  const handleConfirmSave = useCallback(() => {
    const result = saveScenario(scenarioName, { expenseAdj, incomeAdj, extraIncomes, horizon }, isPro);
    setSaveModalVisible(false);
    if (result === 'ok') {
      showAlert('', t('scenarioSimulator.scenarioSaved'));
    } else {
      showAlert(t('scenarioSimulator.savedScenarios'), t('scenarioSimulator.scenarioLimitFree'));
    }
  }, [saveScenario, scenarioName, expenseAdj, incomeAdj, extraIncomes, horizon, isPro, t]);

  const handleLoadScenario = useCallback((scenario: SavedScenario) => {
    onLoad(scenario);
    setLoadModalVisible(false);
  }, [onLoad]);

  const handleDeleteScenario = useCallback((id: string) => {
    showAlert(
      t('scenarioSimulator.deleteScenario'),
      t('common.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteScenario(id) },
      ],
    );
  }, [deleteScenario, t]);

  return (
    <>
      {/* ── Action bar ── */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBarBtn} onPress={() => setLoadModalVisible(true)}>
          <Ionicons name="folder-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.actionBarBtnText}>{t('scenarioSimulator.savedScenarios')}</Text>
          {scenarios.length > 0 && (
            <View style={styles.scenarioBadge}>
              <Text style={styles.scenarioBadgeText}>{scenarios.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBarBtn} onPress={handleSavePress}>
          <Ionicons name="bookmark-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.actionBarBtnText}>{t('scenarioSimulator.saveScenario')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Save Modal ── */}
      <Modal
        visible={saveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding">
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('scenarioSimulator.saveScenario')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={t('scenarioSimulator.saveNamePlaceholder')}
                placeholderTextColor={theme.colors.textTertiary}
                value={scenarioName}
                onChangeText={setScenarioName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleConfirmSave}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setSaveModalVisible(false)}>
                  <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={handleConfirmSave}>
                  <Text style={styles.modalSaveText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Load Modal ── */}
      <Modal
        visible={loadModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLoadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadSheet}>
            <View style={styles.loadSheetHandle} />
            <Text style={styles.loadSheetTitle}>{t('scenarioSimulator.savedScenarios')}</Text>
            {scenarios.length === 0 ? (
              <View style={styles.loadEmptyState}>
                <Ionicons name="folder-open-outline" size={40} color={theme.colors.textDisabled} />
                <Text style={styles.loadEmptyText}>{t('scenarioSimulator.noSavedScenarios')}</Text>
              </View>
            ) : (
              <FlatList
                data={scenarios}
                keyExtractor={s => s.id}
                style={styles.loadList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.loadRow}
                    onPress={() => handleLoadScenario(item)}
                  >
                    <View style={styles.loadRowContent}>
                      <Ionicons name="bookmark" size={16} color={theme.colors.primary} />
                      <View style={styles.loadRowText}>
                        <Text style={styles.loadRowName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.loadRowDate}>
                          {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteScenario(item.id)}
                      style={styles.loadRowDelete}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.loadSeparator} />}
              />
            )}
            <TouchableOpacity style={styles.loadCloseBtn} onPress={() => setLoadModalVisible(false)}>
              <Text style={styles.loadCloseBtnText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  actionBar: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.background,
  },
  actionBarBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
  },
  actionBarBtnText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  scenarioBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
  },
  scenarioBadgeText: {
    ...theme.textStyles.caption,
    color: '#fff',
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    gap: theme.spacing[4],
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  modalInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  modalCancel: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  modalCancelText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  modalSave: {
    flex: 1,
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
  },
  modalSaveText: {
    ...theme.textStyles.bodyMedium,
    color: '#fff',
  },
  loadSheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    maxHeight: '80%' as any,
    alignSelf: 'flex-end' as const,
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: theme.spacing[8],
  },
  loadSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  loadSheetTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  loadList: {
    maxHeight: 320,
  },
  loadEmptyState: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[3],
  },
  loadEmptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  loadRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    justifyContent: 'space-between' as const,
  },
  loadRowContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flex: 1,
  },
  loadRowText: {
    flex: 1,
  },
  loadRowName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  loadRowDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  loadRowDelete: {
    padding: theme.spacing[2],
    marginLeft: theme.spacing[2],
  },
  loadSeparator: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
  },
  loadCloseBtn: {
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center' as const,
  },
  loadCloseBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
});
