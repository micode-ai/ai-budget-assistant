import React, { useState } from 'react';
import { FlatList, View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { resolvePaneListWindow } from '@/features/settings/paneListWindow';
import { useSettingsPane } from './SettingsPaneContext';

/**
 * A cap and the words that announce it travel together, so a caller cannot
 * ask for one without the other. Silent truncation is the defect the cap
 * exists to avoid; making it unrepresentable is cheaper than remembering not
 * to write it. Same shape as `BulkActionBar`'s `onClear`/label pair.
 *
 * The label is a FUNCTION of the hidden count rather than a string, because
 * the count is not known until this component has sliced. It is still
 * key-neutral: the caller does its own `t()`, so no i18n key lives here.
 */
type CapProps =
  | {
      /** Rows to render in a pane before withholding the rest. Ignored full-page. */
      desktopMaxRows: number;
      /** e.g. `(n) => t('priceHistory.showMore', { count: n })`. */
      showMoreLabel: (hiddenCount: number) => string;
      /**
       * Container style for that row. Optional, and it exists for one reason:
       * a capped list's last rendered row does not get whatever "I am the
       * bottom of the card" styling the caller gives its final row, so without
       * this the card ends on a square edge and the affordance floats below it.
       * Giving the row the card's own background and bottom corners makes the
       * card read as ending IN "+N more", which is what it does.
       */
      showMoreStyle?: StyleProp<ViewStyle>;
    }
  | { desktopMaxRows?: undefined; showMoreLabel?: undefined; showMoreStyle?: undefined };

type Props<T> = CapProps & {
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
  /** An element, as `FlatList` also accepts — not a component type. */
  ListHeaderComponent?: React.ReactElement | null;
  /** Rendered in place of the rows when `data` is empty, after the header. */
  ListEmptyComponent?: React.ReactElement | null;
  ItemSeparatorComponent?: React.ComponentType<Record<string, never>> | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
  /** Virtualization tuning. Forwarded on the full-page branch only. */
  initialNumToRender?: number;
  maxToRenderPerBatch?: number;
  windowSize?: number;
  removeClippedSubviews?: boolean;
};

/**
 * {@link SettingsScreenScroll} for a settings screen whose root scroller is a
 * `FlatList`.
 *
 * Its two siblings swap a `ScrollView` for a plain `View`, which is enough
 * because a `ScrollView` renders all of its children either way. A `FlatList`
 * cannot be handled that way: **it is a scroll container**, so leaving it in a
 * pane is the second scrollbar the design language forbids -- the shell owns the
 * page scroll and scrolls both panes together. So the pane branch composes the
 * same pieces by hand -- header, rows with separators between them, or the empty
 * element -- in a plain `View`.
 *
 * ## What that costs, measured, and the claim it corrects
 *
 * An earlier version of this comment said a `FlatList` in a pane would "settle
 * at `initialNumToRender` rows and never advance, because nothing ever scrolls
 * it". **That was wrong**, and it is recorded here rather than quietly deleted
 * because the next person deserves the true explanation. Reading
 * react-native-web's `VirtualizedList`: the render window comes from
 * `computeWindowedRenderLimits`, whose input is `scrollMetrics.visibleLength`,
 * and `_onLayout` sets that to the list's OWN laid-out height, not the
 * viewport's. In an unbounded parent those are the same number, so
 * `overscanLength = (windowSize - 1) x visibleLength` grows with every batch and
 * the window converges on the whole list in a handful of layout passes. There is
 * no twenty-row failure. (`removeClippedSubviews`, while we are here, is not
 * referenced anywhere in RNW's `VirtualizedList` -- a dead prop on web.)
 *
 * So a pane renders every row either way; this branch renders them in one
 * commit instead of several batched passes. On the products pane that measured
 * **12,359 DOM elements and 67,894px of content for ~1,120 products** -- two
 * independently-derived counts agreeing within 1%.
 *
 * ## Hence the cap
 *
 * `desktopMaxRows` bounds what a pane renders, paired with `showMoreLabel` so
 * the truncation is always announced -- see {@link resolvePaneListWindow}. It
 * defaults to absent, so a screen whose list is bounded by construction
 * (merchants is one row per store you shop at; categories one per category you
 * created) needs nothing. Products is the settings list that needed it because
 * it is the one whose length is unbounded: one row per distinct product ever
 * scanned, dozens per receipt, returned by an endpoint with no `take` and no
 * pagination. That is also the real reason it was the only settings screen with
 * a `FlatList` in the first place.
 *
 * The full-page branch is the screen's `FlatList` with its props forwarded
 * unchanged and NO cap, so the phone keeps today's tree including its
 * virtualization tuning -- and there the windowing genuinely works, because
 * inside `SettingsScreenFrame`'s `flex: 1` `SafeAreaView` the list's laid-out
 * height really is the viewport.
 *
 * `contentContainerStyle` is applied in both branches and this component adds
 * no padding of its own, for the same reason its siblings do not: a style
 * array's last entry wins, and silently replacing a screen's `paddingBottom`
 * is precisely the regression the extraction must not cause.
 */
export function SettingsScreenList<T>({
  data,
  keyExtractor,
  renderItem,
  ListHeaderComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  contentContainerStyle,
  showsVerticalScrollIndicator,
  initialNumToRender,
  maxToRenderPerBatch,
  windowSize,
  removeClippedSubviews,
  desktopMaxRows,
  showMoreLabel,
  showMoreStyle,
}: Props<T>) {
  const { desktop } = useSettingsPane();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  // Deliberately NOT reset when `data` changes: it changes on every keystroke
  // in a screen's search box, and collapsing the list under someone who has
  // just expanded it would fight them. `BreakdownCard` keeps it the same way.
  const [expanded, setExpanded] = useState(false);

  if (desktop) {
    const Separator = ItemSeparatorComponent;
    const { visibleCount, hiddenCount, hasMore } = resolvePaneListWindow(
      data.length,
      desktopMaxRows,
      expanded,
    );
    const rows = visibleCount === data.length ? data : data.slice(0, visibleCount);
    return (
      <View style={contentContainerStyle}>
        {ListHeaderComponent}
        {data.length === 0
          ? ListEmptyComponent
          : rows.map((item, index) => (
              <React.Fragment key={keyExtractor(item, index)}>
                {index > 0 && Separator ? <Separator /> : null}
                {renderItem({ item, index })}
              </React.Fragment>
            ))}
        {hasMore && showMoreLabel && (
          <Pressable
            onPress={() => setExpanded(true)}
            accessibilityRole="button"
            style={[styles.showMoreRow, showMoreStyle]}
          >
            <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.showMoreText}>{showMoreLabel(hiddenCount)}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ItemSeparatorComponent={ItemSeparatorComponent}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      initialNumToRender={initialNumToRender}
      maxToRenderPerBatch={maxToRenderPerBatch}
      windowSize={windowSize}
      removeClippedSubviews={removeClippedSubviews}
    />
  );
}

// Mirrors `InflationIndexSection`'s own show-more row, which uses this same
// i18n key over the same product corpus on the Analytics tab -- so a user who
// meets a capped product list in two places meets one affordance, not two.
const createStyles = (theme: Theme) => ({
  showMoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[3],
  },
  showMoreText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
});
