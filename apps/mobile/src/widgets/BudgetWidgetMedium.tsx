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
          backgroundColor: '#0F172A',
          borderRadius: 20,
          padding: 16,
        }}
      >
        <TextWidget
          text="Open app to load data"
          style={{ fontSize: 13, color: '#94A3B8' }}
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

  const maxBarHeight = 36;
  const todayIndex = data.weekBars.length - 1;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#F8FAFB',
        borderRadius: 20,
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      {/* Header row */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          width: 'match_parent',
        }}
      >
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text={(labels?.today ?? 'Today').toUpperCase()}
            style={{ fontSize: 10, color: '#5E6272', letterSpacing: 1 }}
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
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
          {data.todayDelta !== '0%' && (
            <FlexWidget
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: data.deltaDirection === 'up' ? '#FFE5E5' : data.deltaDirection === 'down' ? '#E8F8F5' : '#EEF0F4',
                borderRadius: 8,
                paddingHorizontal: 6,
                paddingVertical: 3,
              }}
            >
              <TextWidget
                text={`${deltaIcon} ${data.todayDelta}`}
                style={{ fontSize: 11, fontWeight: '600', color: deltaColor }}
              />
            </FlexWidget>
          )}
          <TextWidget
            text={`${labels?.week ?? 'Week'}: ${data.weekTotal}`}
            style={{ fontSize: 11, color: '#5E6272', marginTop: 4 }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Bar chart */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          width: 'match_parent',
          height: maxBarHeight + 18,
          marginTop: 12,
        }}
      >
        {data.weekBars.map((bar, i) => {
          const barHeight = bar.maxValue > 0
            ? Math.max(4, (bar.value / bar.maxValue) * maxBarHeight)
            : 4;
          const isToday = i === todayIndex;
          const barColor = isToday ? '#E37F2B' : '#EEF0F4';

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
                  backgroundColor: barColor,
                  borderRadius: 4,
                }}
              />
              <TextWidget
                text={bar.day}
                style={{
                  fontSize: 9,
                  color: isToday ? '#E37F2B' : '#5E6272',
                  marginTop: 4,
                  fontWeight: isToday ? '600' : 'normal',
                }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>
    </FlexWidget>
  );
}
