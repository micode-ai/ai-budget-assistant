import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAP_HTML } from './mapHtml.generated';
import type { ExpenseMapViewProps } from './ExpenseMapView';

// srcDoc iframes are same-origin: we call the window.__* API directly and
// receive messages via parent.postMessage (see mapHtml's send()).
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [readyTick, setReadyTick] = useState(0);
  const lastSyncRef = useRef<{ tick: number; key: string } | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'ready') setReadyTick((t) => t + 1);
        else if (msg.type === 'open' && onPointPress) onPointPress(String(msg.id));
        else if (msg.type === 'mapPress' && onMapPress) onMapPress(Number(msg.lat), Number(msg.lng));
      } catch {
        // ignore non-map messages
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onPointPress, onMapPress]);

  useEffect(() => {
    if (readyTick === 0) return;
    const key = JSON.stringify({ points, center, interactive, picker, pickerPin, openLabel });
    if (lastSyncRef.current?.tick === readyTick && lastSyncRef.current?.key === key) return;
    const win = iframeRef.current?.contentWindow as any;
    if (!win || typeof win.__setPoints !== 'function') return;
    win.__configure({ openLabel, interactive });
    win.__setPicker(picker);
    win.__setPoints(points);
    if (center) win.__setView(center.lat, center.lng, center.zoom);
    if (pickerPin) win.__setPickerPin(pickerPin.lat, pickerPin.lng);
    lastSyncRef.current = { tick: readyTick, key };
  }, [readyTick, points, center, interactive, picker, pickerPin, openLabel]);

  return (
    <View style={[styles.container, style]}>
      <iframe ref={iframeRef} srcDoc={MAP_HTML} style={iframeStyle} title="expense-map" />
    </View>
  );
}

const iframeStyle: React.CSSProperties = { border: 0, width: '100%', height: '100%' };
const styles = StyleSheet.create({ container: { overflow: 'hidden' } });
