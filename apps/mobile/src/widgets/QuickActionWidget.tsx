import React from 'react';
import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetLabels } from '@/services/widgetData';

interface Props {
  labels?: WidgetLabels;
}

const FALLBACK = { voice: 'Voice', scan: 'Scan', add: 'Add' };

const ICONS = {
  voice: require('@/../assets/widget-icons/voice_input.png'),
  scan: require('@/../assets/widget-icons/scan_receipt.png'),
  add: require('@/../assets/widget-icons/add_expense.png'),
};

export function QuickActionWidget({ labels }: Props) {
  const voice = labels?.voice ?? FALLBACK.voice;
  const scan = labels?.scan ?? FALLBACK.scan;
  const add = labels?.add ?? FALLBACK.add;

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: '#F8FAFB',
        borderRadius: 20,
        paddingHorizontal: 8,
        paddingVertical: 6,
        justifyContent: 'space-evenly',
        alignItems: 'center',
      }}
    >
      {/* Voice button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          paddingHorizontal: 8,
          paddingVertical: 10,
          marginHorizontal: 4,
          borderWidth: 1,
          borderColor: '#EEF0F4',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/voice' }}
        accessibilityLabel="Add expense by voice"
      >
        <ImageWidget
          image={ICONS.voice}
          imageWidth={24}
          imageHeight={24}
        />
        <TextWidget
          text={voice}
          style={{
            fontSize: 12,
            color: '#1A1D26',
            marginLeft: 6,
            fontWeight: '600',
          }}
        />
      </FlexWidget>

      {/* Scan button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          paddingHorizontal: 8,
          paddingVertical: 10,
          marginHorizontal: 4,
          borderWidth: 1,
          borderColor: '#EEF0F4',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/receipt' }}
        accessibilityLabel="Scan receipt"
      >
        <ImageWidget
          image={ICONS.scan}
          imageWidth={24}
          imageHeight={24}
        />
        <TextWidget
          text={scan}
          style={{
            fontSize: 12,
            color: '#1A1D26',
            marginLeft: 6,
            fontWeight: '600',
          }}
        />
      </FlexWidget>

      {/* Manual button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          paddingHorizontal: 8,
          paddingVertical: 10,
          marginHorizontal: 4,
          borderWidth: 1,
          borderColor: '#EEF0F4',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/new' }}
        accessibilityLabel="Add expense manually"
      >
        <ImageWidget
          image={ICONS.add}
          imageWidth={24}
          imageHeight={24}
        />
        <TextWidget
          text={add}
          style={{
            fontSize: 12,
            color: '#1A1D26',
            marginLeft: 6,
            fontWeight: '600',
          }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
