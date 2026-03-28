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
          backgroundColor: '#0F172A',
          borderRadius: 16,
          padding: 8,
        }}
      >
        <TextWidget
          text="Open app"
          style={{ fontSize: 12, color: '#94A3B8' }}
        />
      </FlexWidget>
    );
  }

  const labels = data.labels;

  const deltaColor =
    data.deltaDirection === 'up'
      ? '#FF6B6B'
      : data.deltaDirection === 'down'
        ? '#4ECDC4'
        : '#94A3B8';

  const deltaIcon =
    data.deltaDirection === 'up'
      ? '↑'
      : data.deltaDirection === 'down'
        ? '↓'
        : '';

  const badgeBg =
    data.deltaDirection === 'up'
      ? '#2D1515'
      : data.deltaDirection === 'down'
        ? '#0D2D2A'
        : '#1E2235';

  const showDelta = data.todayDelta !== '0%' && deltaIcon !== '';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F8FAFB',
        borderRadius: 16,
        padding: 10,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text={(labels?.today ?? 'Today').toUpperCase()}
        style={{ fontSize: 10, color: '#5E6272', letterSpacing: 0.5 }}
      />
      <TextWidget
        text={data.todaySpent}
        style={{
          fontSize: 20,
          fontWeight: 'bold',
          color: '#1A1D26',
          marginTop: 2,
        }}
      />
      {showDelta && (
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: data.deltaDirection === 'up' ? '#FFE5E5' : data.deltaDirection === 'down' ? '#E8F8F5' : '#EEF0F4',
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginTop: 4,
          }}
        >
          <TextWidget
            text={`${deltaIcon} ${data.todayDelta}`}
            style={{ fontSize: 10, fontWeight: '600', color: deltaColor }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
