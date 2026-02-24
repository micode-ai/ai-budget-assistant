import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetLabels } from '@/services/widgetData';

interface Props {
  labels?: WidgetLabels;
}

const FALLBACK = { voice: 'Voice', scan: 'Scan', add: 'Add' };

export function QuickActionWidget({ labels }: Props) {
  const voice = labels?.voice ?? FALLBACK.voice;
  const scan = labels?.scan ?? FALLBACK.scan;
  const add = labels?.add ?? FALLBACK.add;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: '#0A0F1E',
        borderRadius: 20,
        padding: 8,
        justifyContent: 'space-evenly',
        alignItems: 'center',
      }}
    >
      {/* Voice button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          borderRadius: 14,
          paddingHorizontal: 4,
          paddingVertical: 8,
          marginHorizontal: 4,
          height: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/voice' }}
        accessibilityLabel="Add expense by voice"
      >
        <FlexWidget
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#4ECDC4',
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget text="◉" style={{ fontSize: 16, color: '#0A0F1E', fontWeight: 'bold' }} />
        </FlexWidget>
        <TextWidget
          text={voice}
          style={{
            fontSize: 11,
            color: '#F1F5F9',
            marginTop: 4,
            fontWeight: '600',
          }}
        />
      </FlexWidget>

      {/* Scan button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          borderRadius: 14,
          paddingHorizontal: 4,
          paddingVertical: 8,
          marginHorizontal: 4,
          height: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/receipt' }}
        accessibilityLabel="Scan receipt"
      >
        <FlexWidget
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#4ECDC4',
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget text="≡" style={{ fontSize: 18, color: '#0A0F1E', fontWeight: 'bold' }} />
        </FlexWidget>
        <TextWidget
          text={scan}
          style={{
            fontSize: 11,
            color: '#F1F5F9',
            marginTop: 4,
            fontWeight: '600',
          }}
        />
      </FlexWidget>

      {/* Manual button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827',
          borderRadius: 14,
          paddingHorizontal: 4,
          paddingVertical: 8,
          marginHorizontal: 4,
          height: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/new' }}
        accessibilityLabel="Add expense manually"
      >
        <FlexWidget
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#4ECDC4',
            borderRadius: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <TextWidget text="+" style={{ fontSize: 22, color: '#0A0F1E', fontWeight: 'bold' }} />
        </FlexWidget>
        <TextWidget
          text={add}
          style={{
            fontSize: 11,
            color: '#F1F5F9',
            marginTop: 4,
            fontWeight: '600',
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
