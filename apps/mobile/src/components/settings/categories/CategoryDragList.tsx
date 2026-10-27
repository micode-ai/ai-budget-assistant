import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Text,
  View,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Category } from '@budget/shared-types';
import { useCategoryStore } from '@/stores/categoryStore';
import { useConnectivityStore } from '@/services/connectivity';
import { showAlert } from '@/utils/alert';
import { useStyles, type Theme } from '@/theme';
import {
  GAP_HALF,
  dropPayload,
  dropTargetAt,
  gapBoundaries,
  refusalAt,
  type DropTarget,
  type RowLayout,
} from '@/features/categories/categoryDrop';

type CategoryType = 'expense' | 'income';

export interface CategoryTreeItem {
  category: Category;
  depth: 0 | 1;
}

/** What a row's own touchable must be wired with so the list can run the drag. */
export interface CategoryRowTouch {
  onPress?: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  delayLongPress: number;
}

interface Props {
  type: CategoryType;
  tree: CategoryTreeItem[];
  canEdit: boolean;
  onRowPress: (category: Category) => void;
  renderRow: (item: CategoryTreeItem, touch: CategoryRowTouch) => React.ReactNode;
}

/** Long-press that lifts a row on a touch device. */
const LONG_PRESS_MS = 350;
/** Pointer travel that starts a drag with a mouse (web). */
const WEB_DRAG_SLOP = 4;
const IS_WEB = Platform.OS === 'web';

/**
 * Shared between the expense and income lists of one screen: stops the
 * page's `ScrollView` while a row is lifted, and lets a list find the other
 * section so a drop onto it can say "type mismatch" instead of nothing.
 */
interface DragScope {
  setDragging: (dragging: boolean) => void;
  registerSection: (type: CategoryType, node: View | null) => void;
  sectionNode: (type: CategoryType) => View | null;
}

const DragScopeContext = createContext<DragScope>({
  setDragging: () => {},
  registerSection: () => {},
  sectionNode: () => null,
});

export function CategoryDragScope({
  onDraggingChange,
  children,
}: {
  onDraggingChange: (dragging: boolean) => void;
  children: React.ReactNode;
}) {
  const sections = useRef<Partial<Record<CategoryType, View | null>>>({});
  const value = useMemo<DragScope>(
    () => ({
      setDragging: onDraggingChange,
      registerSection: (type, node) => {
        sections.current[type] = node;
      },
      sectionNode: (type) => sections.current[type] ?? null,
    }),
    [onDraggingChange]
  );
  return <DragScopeContext.Provider value={value}>{children}</DragScopeContext.Provider>;
}

const measureY = (node: View | null): Promise<{ y: number; height: number } | null> =>
  new Promise((resolve) => {
    if (!node) return resolve(null);
    node.measureInWindow((_x, y, _w, height) => resolve({ y, height }));
  });

const sameTarget = (a: DropTarget | null, b: DropTarget | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.kind === b.kind &&
    (a.kind === 'topLevel' || a.categoryId === (b as { categoryId: string }).categoryId));

/**
 * One section of Settings → Categories (expense or income) rendered as a tree
 * with drag and drop: a row dropped on a top-level row becomes its
 * subcategory, a subcategory dropped on a line between top-level rows goes
 * back to the top level. Order never changes. Pure JS (`PanResponder`), no
 * native module.
 *
 * Starting a drag: a long-press on a touch device (a plain swipe still scrolls
 * the page), press-and-move with a mouse on web. Hit-testing is in this
 * list's own layout space: the lifted row's centre is its start centre plus
 * the pointer travel, minus however far the list itself moved on screen since
 * the drag began (the desktop pane can still wheel-scroll during a drag).
 * There is no edge auto-scroll: the page scroll is frozen for the drag, so a
 * long list is scrolled first and the row lifted after.
 */
export function CategoryDragList({ type, tree, canEdit, onRowPress, renderRow }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const scope = useContext(DragScopeContext);
  const updateCategory = useCategoryStore((s) => s.updateCategory);

  const containerRef = useRef<View | null>(null);
  const layouts = useRef(new Map<string, RowLayout>());
  const treeRef = useRef(tree);
  treeRef.current = tree;

  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [lineY, setLineY] = useState<number | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;

  // Gesture bookkeeping; refs because responder callbacks outlive renders.
  const armedId = useRef<string | null>(null);
  const dragging = useRef(false);
  const blocked = useRef(false);
  const startCenter = useRef(0);
  const startContainerY = useRef(0);
  const containerY = useRef(0);
  const otherRange = useRef<{ top: number; bottom: number } | null>(null);
  const measuring = useRef(false);
  const targetRef = useRef<DropTarget | null>(null);

  // Depth comes from the current tree, not the stored layout: a re-parented
  // row can keep its frame (the indent is inside it) and fire no onLayout.
  const rows = (): RowLayout[] =>
    treeRef.current
      .flatMap(({ category, depth }) => {
        const layout = layouts.current.get(category.id);
        return layout ? [{ ...layout, depth }] : [];
      })
      .sort((a, b) => a.top - b.top);
  const sectionCategories = () => treeRef.current.map((i) => i.category);
  const findCategory = (id: string | null) =>
    treeRef.current.find((i) => i.category.id === id)?.category;

  /** Pointer position in this list's layout space. */
  const localY = (dy: number) =>
    startCenter.current + dy - (containerY.current - startContainerY.current);

  const lift = useCallback(
    (id: string) => {
      const layout = layouts.current.get(id);
      startCenter.current = layout ? layout.top + layout.height / 2 : 0;
      translateY.setValue(0);
      // No scroll compensation until the container has been measured.
      containerY.current = startContainerY.current;
      targetRef.current = null;
      setTarget(null);
      setLineY(null);
      setLiftedId(id);
      scope.setDragging(true);
      void Promise.all([
        measureY(containerRef.current),
        measureY(scope.sectionNode(type === 'expense' ? 'income' : 'expense')),
      ]).then(([mine, other]) => {
        if (!mine) return;
        startContainerY.current = mine.y;
        containerY.current = mine.y;
        otherRange.current = other
          ? { top: other.y - mine.y, bottom: other.y - mine.y + other.height }
          : null;
      });
    },
    [scope, translateY, type]
  );

  const drop = useCallback(() => {
    armedId.current = null;
    dragging.current = false;
    blocked.current = false;
    targetRef.current = null;
    translateY.setValue(0);
    setLiftedId(null);
    setTarget(null);
    setLineY(null);
    scope.setDragging(false);
  }, [scope, translateY]);

  const onMove = (gs: PanResponderGestureState) => {
    const dragged = findCategory(armedId.current);
    if (!dragged) return;
    if (!measuring.current) {
      measuring.current = true;
      void measureY(containerRef.current).then((m) => {
        measuring.current = false;
        if (m) containerY.current = m.y;
      });
    }
    translateY.setValue(gs.dy - (containerY.current - startContainerY.current));
    const y = localY(gs.dy);
    const current = rows();
    const next = dropTargetAt(y, current, dragged, sectionCategories());
    if (!sameTarget(next, targetRef.current)) {
      targetRef.current = next;
      setTarget(next);
    }
    if (next?.kind === 'topLevel') {
      // Draw the line in the middle of the space between two rows.
      const boundary = gapBoundaries(current).find((b) => Math.abs(y - b) <= GAP_HALF);
      if (boundary === undefined) return;
      const before = current.filter((r) => r.top + r.height <= boundary).pop();
      const after = current.find((r) => r.top >= boundary);
      setLineY(before && after ? (before.top + before.height + after.top) / 2 : boundary);
    } else {
      setLineY(null);
    }
  };

  const onRelease = async (gs: PanResponderGestureState) => {
    const dragged = findCategory(armedId.current);
    const y = localY(gs.dy);
    const current = rows();
    const categories = sectionCategories();
    // Commit only the target the user saw highlighted: capture it before
    // `drop()` clears it, never recompute from the release point (the last
    // move frame and the release coordinates can disagree).
    const finalTarget = targetRef.current;
    drop();
    if (!dragged) return;
    if (finalTarget) {
      try {
        await updateCategory(dragged.id, dropPayload(finalTarget));
      } catch (error: any) {
        showAlert(
          t('common.error'),
          error?.status === 400 ? t('categories.parentInvalid') : t('errors.saveFailed')
        );
      }
      return;
    }
    const refusal = refusalAt(y, current, dragged, categories);
    if (refusal) {
      showAlert(t(`categories.dropRefused.${refusal}`));
      return;
    }
    const other = otherRange.current;
    if (other && y >= other.top && y < other.bottom) {
      showAlert(t('categories.dropRefused.typeMismatch'));
    }
  };

  // Latest handlers, read by the cached responders.
  const handlers = useRef({ onMove, onRelease });
  handlers.current = { onMove, onRelease };

  const responders = useRef(new Map<string, GestureResponderHandlers>());
  // The responders close over `t`, `lift` and `drop`; rebuild them when those change.
  const responderDeps = useRef<unknown[]>([t, lift, drop]);
  if (responderDeps.current.some((d, i) => d !== [t, lift, drop][i])) {
    responderDeps.current = [t, lift, drop];
    responders.current.clear();
  }
  const responderFor = (id: string): GestureResponderHandlers => {
    const cached = responders.current.get(id);
    if (cached) return cached;
    const created = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (e, gs) => {
        if (blocked.current) return false;
        if (armedId.current === id) return true;
        // A mouse on web starts on press-and-move; touch always needs the
        // long-press, so a plain swipe keeps scrolling the page.
        const isMouse = String((e.nativeEvent as { type?: string }).type ?? '').startsWith('mouse');
        return (
          IS_WEB && isMouse && (Math.abs(gs.dx) > WEB_DRAG_SLOP || Math.abs(gs.dy) > WEB_DRAG_SLOP)
        );
      },
      onPanResponderGrant: () => {
        dragging.current = true;
        if (armedId.current === id) return; // lifted already by the long-press
        if (useConnectivityStore.getState().status === 'offline') {
          blocked.current = true;
          showAlert(t('categories.dragNeedsInternet'));
          return;
        }
        armedId.current = id;
        lift(id);
      },
      onPanResponderMove: (_e, gs) => {
        if (!blocked.current) handlers.current.onMove(gs);
      },
      onPanResponderRelease: (_e, gs) => {
        if (blocked.current) return drop();
        void handlers.current.onRelease(gs);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => drop(),
    }).panHandlers;
    responders.current.set(id, created);
    return created;
  };

  const onLayoutRow = (item: CategoryTreeItem) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    layouts.current.set(item.category.id, {
      categoryId: item.category.id,
      depth: item.depth,
      top: y,
      height,
    });
  };

  const touchFor = (item: CategoryTreeItem): CategoryRowTouch => {
    if (!canEdit) return { delayLongPress: LONG_PRESS_MS };
    const id = item.category.id;
    return {
      onPress: () => onRowPress(item.category),
      delayLongPress: LONG_PRESS_MS,
      onLongPress: () => {
        if (useConnectivityStore.getState().status === 'offline') {
          // No drag for the rest of this press (a mouse would start one by moving).
          blocked.current = true;
          showAlert(t('categories.dragNeedsInternet'));
          return;
        }
        armedId.current = id;
        lift(id);
      },
      // Released without dragging (after a long-press, or after an offline
      // refusal): put the row back down and clear the press.
      onPressOut: () => {
        if (!dragging.current && (armedId.current === id || blocked.current)) drop();
      },
    };
  };

  return (
    <View
      ref={(node) => {
        containerRef.current = node;
        scope.registerSection(type, node);
      }}
      style={IS_WEB ? (styles.webNoSelect as object) : undefined}
    >
      {tree.map((item, i) => {
        const id = item.category.id;
        const isLifted = liftedId === id;
        const isTarget = target?.kind === 'parent' && target.categoryId === id;
        return (
          <React.Fragment key={id}>
            <Animated.View
              onLayout={onLayoutRow(item)}
              style={[
                styles.row,
                isTarget && styles.rowTarget,
                isLifted && styles.rowLifted,
                isLifted && { transform: [{ translateY }] },
              ]}
              {...(canEdit ? responderFor(id) : {})}
            >
              {renderRow(item, touchFor(item))}
              {isTarget && (
                <View style={styles.targetPill} pointerEvents="none">
                  <Text style={styles.targetText}>{t('categories.dropMakeSub')}</Text>
                </View>
              )}
            </Animated.View>
            {i < tree.length - 1 && <View style={styles.divider} />}
          </React.Fragment>
        );
      })}
      {lineY !== null && <View pointerEvents="none" style={[styles.gapLine, { top: lineY - 1 }]} />}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  webNoSelect: { userSelect: 'none' } as object,
  // A permanent transparent 1px border: hover only recolours it, so the row
  // never changes size and the measured hit boxes stay put during a drag.
  row: { borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: 'transparent' },
  rowTarget: {
    backgroundColor: theme.colors.primary + '20',
    borderColor: theme.colors.primary,
  },
  rowLifted: {
    backgroundColor: theme.colors.surfaceSecondary,
    opacity: 0.95,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: theme.isDark ? 0.4 : 0.18,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  targetPill: {
    position: 'absolute' as const,
    right: theme.spacing[2],
    top: 0,
    bottom: 0,
    justifyContent: 'center' as const,
  },
  targetText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden' as const,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },
  gapLine: {
    position: 'absolute' as const,
    left: -theme.spacing[2],
    right: -theme.spacing[2],
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
});
