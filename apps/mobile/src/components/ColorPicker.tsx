import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, PanResponder, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { hexToHsl, hslToHex, readableOn } from '@/theme/deriveAccent';

interface Props {
  initialColor: string;
  onApply: (hex: string) => void;
  onReset: () => void;
  onClose: () => void;
}

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({ initialColor, onApply, onReset, onClose }: Props) {
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { t } = useTranslation();

  const init = useMemo(() => hexToHsl(HEX_RE.test(initialColor) ? initialColor : '#E37F2B'), [initialColor]);
  const [h, setH] = useState(init.h);
  const [s, setS] = useState(init.s);
  const [l, setL] = useState(init.l);
  const [hexText, setHexText] = useState(hslToHex(init));

  const [hueW, setHueW] = useState(1);
  const [sqW, setSqW] = useState(1);
  const [sqH, setSqH] = useState(1);

  const current = hslToHex({ h, s, l });

  const syncFromHsl = (nh: number, ns: number, nl: number) => {
    setHexText(hslToHex({ h: nh, s: ns, l: nl }));
  };

  const huePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const x = Math.max(0, Math.min(hueW, e.nativeEvent.locationX));
          const nh = (x / hueW) * 360;
          setH(nh);
          syncFromHsl(nh, s, l);
        },
        onPanResponderMove: (e) => {
          const x = Math.max(0, Math.min(hueW, e.nativeEvent.locationX));
          const nh = (x / hueW) * 360;
          setH(nh);
          syncFromHsl(nh, s, l);
        },
      }),
    [hueW, s, l],
  );

  const squarePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => handleSquare(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: (e) => handleSquare(e.nativeEvent.locationX, e.nativeEvent.locationY),
      }),
    [sqW, sqH, h],
  );

  function handleSquare(x: number, y: number) {
    const ns = Math.max(0, Math.min(100, (x / sqW) * 100));
    const nl = Math.max(0, Math.min(100, 100 - (y / sqH) * 100));
    setS(ns);
    setL(nl);
    syncFromHsl(h, ns, nl);
  }

  const onHexChange = (text: string) => {
    setHexText(text);
    if (HEX_RE.test(text)) {
      const parsed = hexToHsl(text);
      setH(parsed.h);
      setS(parsed.s);
      setL(parsed.l);
    }
  };

  const hueThumbX = (h / 360) * hueW;
  const sqThumbX = (s / 100) * sqW;
  const sqThumbY = (1 - l / 100) * sqH;
  const hexValid = HEX_RE.test(hexText);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('settings.pickColor')}</Text>

      {/* Saturation / lightness square */}
      <View
        style={styles.square}
        onLayout={(ev: LayoutChangeEvent) => {
          setSqW(ev.nativeEvent.layout.width);
          setSqH(ev.nativeEvent.layout.height);
        }}
        {...squarePan.panHandlers}
      >
        <View style={[styles.squareFill, { backgroundColor: hslToHex({ h, s: 100, l: 50 }) }]} />
        <LinearGradient
          colors={['#FFFFFF', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.squareFill}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.squareFill}
        />
        <View pointerEvents="none" style={[styles.squareThumb, { left: sqThumbX - 8, top: sqThumbY - 8 }]} />
      </View>

      {/* Hue slider */}
      <View style={styles.hue} onLayout={(ev) => setHueW(ev.nativeEvent.layout.width)} {...huePan.panHandlers}>
        <LinearGradient
          colors={HUE_STOPS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.hueFill}
        />
        <View pointerEvents="none" style={[styles.hueThumb, { left: Math.max(0, Math.min(hueW - 4, hueThumbX - 2)) }]} />
      </View>

      {/* Hex input + preview */}
      <View style={styles.row}>
        <TextInput
          value={hexText}
          onChangeText={onHexChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          style={[styles.hexInput, !hexValid && styles.hexInputInvalid]}
          placeholder="#RRGGBB"
          placeholderTextColor={theme.colors.textTertiary}
        />
        <View style={styles.previewRow}>
          <View style={[styles.previewBtn, { backgroundColor: current }]}>
            <Text style={{ color: readableOn(current), fontSize: 12, fontWeight: '600' }}>Aa</Text>
          </View>
          <View style={[styles.previewDot, { backgroundColor: current }]} />
        </View>
      </View>
      {!hexValid && <Text style={styles.invalid}>{t('settings.invalidColor')}</Text>}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onReset}>
          <Text style={styles.secondaryText}>{t('settings.resetAccent')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: current }, !hexValid && styles.disabledBtn]}
          disabled={!hexValid}
          onPress={() => { onApply(current); onClose(); }}
        >
          <Text style={[styles.primaryText, { color: readableOn(current) }]}>{t('settings.applyColor')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: { gap: theme.spacing[3] },
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  square: { width: '100%' as const, height: 170, borderRadius: theme.borderRadius.md, overflow: 'hidden' as const, position: 'relative' as const },
  squareFill: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const) },
  squareThumb: { position: 'absolute' as const, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF' },
  hue: { width: '100%' as const, height: 24, borderRadius: 12, overflow: 'hidden' as const, justifyContent: 'center' as const },
  hueFill: { ...({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const) },
  hueThumb: { position: 'absolute' as const, width: 4, height: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#00000033' },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  hexInput: { flex: 1, ...theme.textStyles.body, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[2], borderWidth: 1, borderColor: theme.colors.border },
  hexInputInvalid: { borderColor: theme.colors.danger },
  previewRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  previewBtn: { width: 40, height: 32, borderRadius: theme.borderRadius.md, alignItems: 'center' as const, justifyContent: 'center' as const },
  previewDot: { width: 16, height: 16, borderRadius: 8 },
  invalid: { ...theme.textStyles.bodySmMedium, color: theme.colors.danger },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[2] },
  secondaryBtn: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: theme.spacing[3], borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border },
  secondaryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  primaryBtn: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: theme.spacing[3], borderRadius: theme.borderRadius.lg },
  primaryText: { ...theme.textStyles.bodyMedium },
  disabledBtn: { opacity: 0.5 },
});
