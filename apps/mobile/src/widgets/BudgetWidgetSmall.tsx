import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSmallData } from '@/services/widgetData';

interface Props {
  data: WidgetSmallData | null;
}

export function BudgetWidgetSmall({ data }: Props) {
  if (!data) {
    return (
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 12,
        }}
      >
        <TextWidget
          text="No data yet"
          style={{ fontSize: 14, color: '#999999' }}
        />
      </FlexWidget>
    );
  }

  const deltaColor =
    data.deltaDirection === 'up'
      ? '#E74C3C'
      : data.deltaDirection === 'down'
        ? '#2ECC71'
        : '#999999';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text="Today"
        style={{ fontSize: 12, color: '#999999' }}
      />
      <TextWidget
        text={data.todaySpent}
        style={{ fontSize: 24, fontWeight: 'bold', color: '#1A1A2E' }}
      />
      <TextWidget
        text={data.todayDelta}
        style={{ fontSize: 12, color: deltaColor }}
      />
    </FlexWidget>
  );
}
