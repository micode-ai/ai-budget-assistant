import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Animated,
  PanResponder,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useWidgetVisibilityStore, WIDGET_KEYS, type WidgetKey } from '@/stores/widgetVisibilityStore';
import { useTheme, useStyles, type Theme } from '@/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const ITEM_HEIGHT = 56;

export default function WidgetsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { visibility, order, setVisible, reorder, resetOrder } = useWidgetVisibilityStore();

  const [localOrder, setLocalOrder] = useState<WidgetKey[]>(order);
  const [activeKey, setActiveKey] = useState<WidgetKey | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const localOrderRef = useRef<WidgetKey[]>(order);
  const storeOrderRef = useRef<WidgetKey[]>(order);
  storeOrderRef.current = order; // always current store order
  const dragStartIndex = useRef(-1);
  const dragKey = useRef<WidgetKey | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;

  // Keep localOrder in sync with store when not dragging
  const latestOrder = useRef(order);
  if (!isDragging && order !== latestOrder.current) {
    latestOrder.current = order;
    setLocalOrder(order);
    localOrderRef.current = order;
  }

  const widgetLabels: Record<WidgetKey, string> = {
    gamification: t('settings.widget.gamification'),
    monthlyBudget: t('settings.widget.monthlyBudget'),
    incomeExpenses: t('settings.widget.incomeExpenses'),
    debts: t('settings.widget.debts'),
    netProfit: t('settings.widget.netProfit'),
    netCapital: t('settings.widget.netCapital'),
    fatFinder: t('settings.widget.fatFinder'),
    calendar: t('settings.widget.calendar'),
    goals: t('settings.widget.goals'),
    wallets: t('settings.widget.wallets'),
  };

  const createDragResponder = useCallback(
    (key: WidgetKey) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: () => {
          dragKey.current = key;
          dragStartIndex.current = localOrderRef.current.indexOf(key);
          translateY.setValue(0);
          setActiveKey(key);
          setIsDragging(true);
        },

        onPanResponderMove: (_, gs) => {
          const dy = gs.dy;
          const total = localOrderRef.current.length;
          const currentIdx = localOrderRef.current.indexOf(dragKey.current!);

          const logicalIdx = Math.max(
            0,
            Math.min(total - 1, Math.round(dragStartIndex.current + dy / ITEM_HEIGHT)),
          );

          const visualOffset = dy - (logicalIdx - dragStartIndex.current) * ITEM_HEIGHT;
          translateY.setValue(visualOffset);

          if (logicalIdx !== currentIdx) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setLocalOrder((prev) => {
              const next = [...prev];
              next.splice(currentIdx, 1);
              next.splice(logicalIdx, 0, dragKey.current!);
              localOrderRef.current = next;
              return next;
            });
          }
        },

        onPanResponderRelease: () => {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          setActiveKey(null);
          setIsDragging(false);
          reorder(localOrderRef.current);
        },

        onPanResponderTerminate: () => {
          translateY.setValue(0);
          setActiveKey(null);
          setIsDragging(false);
          const restored = storeOrderRef.current;
          setLocalOrder(restored);
          localOrderRef.current = restored;
        },
      }).panHandlers,
    [translateY, reorder, storeOrderRef],
  );

  // Create per-key responders; invalidate cache when createDragResponder identity changes
  const responders = useRef<Partial<Record<WidgetKey, ReturnType<typeof createDragResponder>>>>({});
  const lastCreateFn = useRef(createDragResponder);
  if (lastCreateFn.current !== createDragResponder) {
    lastCreateFn.current = createDragResponder;
    responders.current = {};
  }
  for (const key of WIDGET_KEYS) {
    if (!responders.current[key]) {
      responders.current[key] = createDragResponder(key);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        scrollEnabled={!isDragging}
      >
        <Text style={styles.hint}>{t('settings.widgetsReorderHint')}</Text>

        <View style={styles.card}>
          {localOrder.map((key, index) => {
            const isActive = activeKey === key;
            const isHidden = !visibility[key];

            return (
              <View key={key}>
                <Animated.View
                  style={[
                    styles.fieldRow,
                    isHidden && styles.fieldRowHidden,
                    isActive && styles.fieldRowActive,
                    isActive && { transform: [{ translateY }] },
                  ]}
                >
                  {/* Drag handle */}
                  <View
                    style={styles.dragHandle}
                    {...(responders.current[key] ?? {})}
                  >
                    <Ionicons
                      name="reorder-three-outline"
                      size={24}
                      color={isHidden ? theme.colors.textDisabled : theme.colors.textTertiary}
                    />
                  </View>

                  <Text style={[styles.fieldLabel, isHidden && styles.fieldLabelHidden]}>
                    {widgetLabels[key]}
                  </Text>

                  <Switch
                    value={visibility[key]}
                    onValueChange={(v) => setVisible(key, v)}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  />
                </Animated.View>
                {index < localOrder.length - 1 && <View style={styles.divider} />}
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.resetButton} onPress={resetOrder} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={styles.resetButtonText}>{t('settings.widgetsResetOrder')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
    textAlign: 'center' as const,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: ITEM_HEIGHT,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  fieldRowHidden: {
    opacity: 0.45,
  },
  fieldRowActive: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: theme.isDark ? 0.4 : 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  dragHandle: {
    width: 40,
    height: ITEM_HEIGHT,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[2],
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  fieldLabelHidden: {
    color: theme.colors.textDisabled,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginLeft: 40 + theme.spacing[2],
  },
  resetButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  resetButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
});
