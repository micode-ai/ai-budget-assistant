import React from 'react';
import { FlatList, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSettingsPane } from './SettingsPaneContext';

interface Props<T> {
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
}

/**
 * {@link SettingsScreenScroll} for a settings screen whose root scroller is a
 * `FlatList`.
 *
 * Its two siblings swap a `ScrollView` for a plain `View`, which is enough
 * because a `ScrollView` renders all of its children either way. A `FlatList`
 * cannot be handled that way, and the reason is worth stating rather than
 * inferring from the code:
 *
 * - **It is a scroll container**, so leaving it in a pane is the second
 *   scrollbar the design language forbids — the shell owns the page scroll and
 *   scrolls both panes together.
 * - **It renders only what it thinks is visible.** A `VirtualizedList` decides
 *   its render window from its own scroll metrics, so inside a pane — whose
 *   height is the shell's content, not a viewport — it would settle at
 *   `initialNumToRender` rows and never advance, because nothing ever scrolls
 *   *it*. The failure mode is a list that silently stops at twenty products
 *   with no error anywhere, which is exactly the kind of defect nothing in this
 *   repo can catch: no component is rendered in CI.
 *
 * So the pane branch composes the same pieces by hand — header, then rows with
 * separators between them, or the empty element — in a plain `View`. That is
 * what every other extracted settings screen already does with its own arrays,
 * and virtualization buys nothing there: the pane is web-only, above 1024px,
 * and a few hundred rows of DOM is what the merchants and categories panes
 * already render.
 *
 * The full-page branch is the screen's `FlatList` with its props forwarded
 * unchanged, so the phone keeps today's tree including its virtualization
 * tuning.
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
}: Props<T>) {
  const { desktop } = useSettingsPane();

  if (desktop) {
    const Separator = ItemSeparatorComponent;
    return (
      <View style={contentContainerStyle}>
        {ListHeaderComponent}
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) => (
              <React.Fragment key={keyExtractor(item, index)}>
                {index > 0 && Separator ? <Separator /> : null}
                {renderItem({ item, index })}
              </React.Fragment>
            ))}
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
