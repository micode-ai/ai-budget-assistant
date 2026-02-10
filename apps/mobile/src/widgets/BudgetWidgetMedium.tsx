import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetMediumData } from '@/services/widgetData';

interface Props {
  data: WidgetMediumData | null;
}

export function BudgetWidgetMedium({ data }: Props) {
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
          padding: 16,
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

  const maxBarHeight = 40;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      {/* Header row */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: 'match_parent',
        }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text="Today"
            style={{ fontSize: 11, color: '#999999' }}
          />
          <TextWidget
            text={data.todaySpent}
            style={{ fontSize: 20, fontWeight: 'bold', color: '#1A1A2E' }}
          />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          <TextWidget
            text={data.todayDelta}
            style={{ fontSize: 12, color: deltaColor }}
          />
          <TextWidget
            text={`Week: ${data.weekTotal}`}
            style={{ fontSize: 11, color: '#666666' }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Mini bar chart */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          width: 'match_parent',
          height: maxBarHeight + 16,
          marginTop: 8,
        }}
      >
        {data.weekBars.map((bar, i) => {
          const barHeight = bar.maxValue > 0
            ? Math.max(4, (bar.value / bar.maxValue) * maxBarHeight)
            : 4;
          return (
            <FlexWidget
              key={i}
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                marginHorizontal: 2,
              }}
            >
              <FlexWidget
                style={{
                  width: 'match_parent',
                  height: barHeight,
                  backgroundColor: '#4ECDC4',
                  borderRadius: 4,
                }}
              />
              <TextWidget
                text={bar.day}
                style={{ fontSize: 9, color: '#999999', marginTop: 2 }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>
    </FlexWidget>
  );
}
