import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  Animated,
  PanResponder,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const ITEM_HEIGHT = 56;

interface ReorderableToggleListProps<K extends string> {
  keys: readonly K[];
  order: K[];
  visibility: Record<K, boolean>;
  labels: Record<K, string>;
  onReorder: (next: K[]) => void;
  onToggle: (key: K, visible: boolean) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

export function ReorderableToggleList<K extends string>({
  keys,
  order,
  visibility,
  labels,
  onReorder,
  onToggle,
  onDraggingChange,
}: ReorderableToggleListProps<K>) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [localOrder, setLocalOrder] = useState<K[]>(order);
  const [activeKey, setActiveKey] = useState<K | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const localOrderRef = useRef<K[]>(order);
  const storeOrderRef = useRef<K[]>(order);
  storeOrderRef.current = order;
  const dragStartIndex = useRef(-1);
  const dragKey = useRef<K | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    onDraggingChange?.(isDragging);
  }, [isDragging, onDraggingChange]);

  // Keep localOrder in sync with the store when not dragging.
  // INVARIANT: `order` must be referentially stable between renders (pass the
  // array straight from the Zustand store, not a fresh `.slice()`/literal each
  // render). The identity check below schedules a setLocalOrder only when the
  // store's order array is actually replaced; a new array every render would
  // loop. Both quickActionStore and widgetVisibilityStore satisfy this.
  const latestOrder = useRef(order);
  if (!isDragging && order !== latestOrder.current) {
    latestOrder.current = order;
    setLocalOrder(order);
    localOrderRef.current = order;
  }

  const createDragResponder = useCallback(
    (key: K) =>
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
          onReorder(localOrderRef.current);
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
    // storeOrderRef omitted intentionally: it's a stable ref whose .current is
    // reassigned synchronously on every render before any gesture fires.
    [translateY, onReorder],
  );

  // Per-key responder cache; invalidate when createDragResponder identity changes.
  const responders = useRef<Partial<Record<K, ReturnType<typeof createDragResponder>>>>({});
  const lastCreateFn = useRef(createDragResponder);
  if (lastCreateFn.current !== createDragResponder) {
    lastCreateFn.current = createDragResponder;
    responders.current = {};
  }
  for (const key of keys) {
    if (!responders.current[key]) {
      responders.current[key] = createDragResponder(key);
    }
  }

  return (
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
              <View style={styles.dragHandle} {...(responders.current[key] ?? {})}>
                <Ionicons
                  name="reorder-three-outline"
                  size={24}
                  color={isHidden ? theme.colors.textDisabled : theme.colors.textTertiary}
                />
              </View>

              <Text style={[styles.fieldLabel, isHidden && styles.fieldLabelHidden]}>
                {labels[key]}
              </Text>

              <Switch
                value={visibility[key]}
                onValueChange={(v) => onToggle(key, v)}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </Animated.View>
            {index < localOrder.length - 1 && <View style={styles.divider} />}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
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
});
