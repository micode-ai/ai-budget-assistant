import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function QuickActionWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
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
          backgroundColor: '#F0FFFE',
          borderRadius: 12,
          padding: 8,
          marginHorizontal: 4,
          height: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/voice' }}
        accessibilityLabel="Add expense by voice"
      >
        <TextWidget text="🎤" style={{ fontSize: 20 }} />
        <TextWidget text="Voice" style={{ fontSize: 11, color: '#333333', marginTop: 2 }} />
      </FlexWidget>

      {/* Scan button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFF8F0',
          borderRadius: 12,
          padding: 8,
          marginHorizontal: 4,
          height: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/receipt' }}
        accessibilityLabel="Scan receipt"
      >
        <TextWidget text="📷" style={{ fontSize: 20 }} />
        <TextWidget text="Scan" style={{ fontSize: 11, color: '#333333', marginTop: 2 }} />
      </FlexWidget>

      {/* Manual button */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F0F0FF',
          borderRadius: 12,
          padding: 8,
          marginHorizontal: 4,
          height: 'match_parent',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'budget://expense/new' }}
        accessibilityLabel="Add expense manually"
      >
        <TextWidget text="✏️" style={{ fontSize: 20 }} />
        <TextWidget text="Add" style={{ fontSize: 11, color: '#333333', marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );
}
