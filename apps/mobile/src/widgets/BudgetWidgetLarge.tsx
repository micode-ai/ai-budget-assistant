import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetLargeData } from '@/services/widgetData';

interface Props {
  data: WidgetLargeData | null;
}

export function BudgetWidgetLarge({ data }: Props) {
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

  const todayIndex = data.weekBars.length - 1;
  const maxBarHeight = 28;

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
      {/* Header */}
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

      {/* Mini bar chart */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          width: 'match_parent',
          height: maxBarHeight + 16,
          marginTop: 12,
        }}
      >
        {data.weekBars.map((bar, i) => {
          const barHeight = bar.maxValue > 0
            ? Math.max(3, (bar.value / bar.maxValue) * maxBarHeight)
            : 3;
          const isToday = i === todayIndex;
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
                  backgroundColor: isToday ? '#E37F2B' : '#EEF0F4',
                  borderRadius: 3,
                }}
              />
              <TextWidget
                text={bar.day}
                style={{
                  fontSize: 8,
                  color: isToday ? '#E37F2B' : '#5E6272',
                  marginTop: 3,
                  fontWeight: isToday ? '600' : 'normal',
                }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>

      {/* Divider */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 1,
          backgroundColor: '#EEF0F4',
          marginTop: 10,
          marginBottom: 8,
        }}
      />

      {/* Budget progress bars */}
      {data.budgets.length > 0 && (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
          }}
        >
          <TextWidget
            text={(labels?.budgets ?? 'Budgets').toUpperCase()}
            style={{
              fontSize: 9,
              color: '#94A3B8',
              letterSpacing: 1,
              marginBottom: 6,
            }}
          />
          {data.budgets.slice(0, 3).map((budget, i) => {
            const progressColor = budget.isOverBudget ? '#FF6B6B' : '#E37F2B';
            const trackColor = budget.isOverBudget ? '#FFE5E5' : '#F2F4F7';

            return (
              <FlexWidget
                key={i}
                style={{
                  flexDirection: 'column',
                  width: 'match_parent',
                  marginBottom: 6,
                }}
              >
                <FlexWidget
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    width: 'match_parent',
                    marginBottom: 3,
                  }}
                >
                  <TextWidget
                    text={budget.name}
                    style={{ fontSize: 11, color: '#1A1D26' }}
                  />
                  <TextWidget
                    text={`${budget.spent} / ${budget.limit}`}
                    style={{ fontSize: 11, color: '#5E6272' }}
                  />
                </FlexWidget>
                {/* Progress bar track */}
                <FlexWidget
                  style={{
                    width: 'match_parent',
                    height: 6,
                    backgroundColor: trackColor,
                    borderRadius: 3,
                  }}
                >
                  {/* Progress bar fill */}
                  <FlexWidget
                    style={{
                      width: `${Math.min(budget.percent, 100)}%` as any,
                      height: 6,
                      backgroundColor: progressColor,
                      borderRadius: 3,
                    }}
                  />
                </FlexWidget>
              </FlexWidget>
            );
          })}
        </FlexWidget>
      )}

      {/* Top categories */}
      {data.topCategories.length > 0 && (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            marginTop: 6,
          }}
        >
          <TextWidget
            text={(labels?.topCategories ?? 'Top Categories').toUpperCase()}
            style={{
              fontSize: 9,
              color: '#94A3B8',
              letterSpacing: 1,
              marginBottom: 5,
            }}
          />
          {data.topCategories.map((cat, i) => (
            <FlexWidget
              key={i}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: 'match_parent',
                marginBottom: 4,
              }}
            >
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FlexWidget
                  style={{
                    width: 22,
                    height: 22,
                    backgroundColor: '#F2F4F7',
                    borderRadius: 6,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 8,
                  }}
                >
                  <TextWidget
                    text={cat.icon}
                    style={{ fontSize: 12 }}
                  />
                </FlexWidget>
                <TextWidget
                  text={cat.name}
                  style={{ fontSize: 11, color: '#1A1D26' }}
                />
              </FlexWidget>
              <TextWidget
                text={cat.amount}
                style={{ fontSize: 11, fontWeight: 'bold', color: '#1A1D26' }}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
