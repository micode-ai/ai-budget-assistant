import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { MAP_HTML } from './mapHtml.generated';
import type { ExpenseMapPoint } from './buildMapPoints';

export interface ExpenseMapViewProps {
  points?: ExpenseMapPoint[];
  onPointPress?: (id: string) => void;
  onMapPress?: (lat: number, lng: number) => void;
  /** Explicit center wins over the auto fit-bounds from points. */
  center?: { lat: number; lng: number; zoom: number };
  /** false = static mini-map (no gestures). */
  interactive?: boolean;
  /** Picker mode: taps place/move a draggable pin and emit onMapPress. */
  picker?: boolean;
  pickerPin?: { lat: number; lng: number } | null;
  openLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ExpenseMapView({
  points = [],
  onPointPress,
  onMapPress,
  center,
  interactive = true,
  picker = false,
  pickerPin = null,
  openLabel = 'Open',
  style,
}: ExpenseMapViewProps) {
  const webviewRef = useRef<WebView>(null);
  const [readyTick, setReadyTick] = useState(0);
  const lastSyncRef = useRef<{ tick: number; js: string } | null>(null);

  useEffect(() => {
    if (readyTick === 0) return;
    const js =
      [
        `window.__configure(${JSON.stringify({ openLabel, interactive })});`,
        `window.__setPicker(${picker ? 'true' : 'false'});`,
        `window.__setPoints(${JSON.stringify(points)});`,
        center ? `window.__setView(${center.lat}, ${center.lng}, ${center.zoom});` : '',
        pickerPin ? `window.__setPickerPin(${pickerPin.lat}, ${pickerPin.lng});` : '',
      ].join('\n') + '\ntrue;';
    if (lastSyncRef.current?.tick === readyTick && lastSyncRef.current?.js === js) return;
    webviewRef.current?.injectJavaScript(js);
    lastSyncRef.current = { tick: readyTick, js };
  }, [readyTick, points, center, interactive, picker, pickerPin, openLabel]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'ready') setReadyTick((t) => t + 1);
        else if (msg.type === 'open' && onPointPress) onPointPress(String(msg.id));
        else if (msg.type === 'mapPress' && onMapPress) onMapPress(Number(msg.lat), Number(msg.lng));
      } catch {
        // ignore malformed bridge messages
      }
    },
    [onPointPress, onMapPress],
  );

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: MAP_HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        setSupportMultipleWindows={false}
        nestedScrollEnabled
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
