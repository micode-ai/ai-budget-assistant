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
      {/* Header */}
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

      {/* Budget progress bars */}
      {data.budgets.length > 0 && (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            marginTop: 12,
          }}
        >
          <TextWidget
            text="Budgets"
            style={{ fontSize: 11, color: '#999999', marginBottom: 6 }}
          />
          {data.budgets.slice(0, 3).map((budget, i) => (
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
                }}
              >
                <TextWidget
                  text={budget.name}
                  style={{ fontSize: 11, color: '#333333' }}
                />
                <TextWidget
                  text={`${budget.spent} / ${budget.limit}`}
                  style={{ fontSize: 10, color: '#666666' }}
                />
              </FlexWidget>
              {/* Progress bar background */}
              <FlexWidget
                style={{
                  width: 'match_parent',
                  height: 6,
                  backgroundColor: '#EEEEEE',
                  borderRadius: 3,
                  marginTop: 2,
                }}
              >
                {/* Progress bar fill */}
                <FlexWidget
                  style={{
                    width: `${Math.min(budget.percent, 100)}%` as any,
                    height: 6,
                    backgroundColor: budget.isOverBudget ? '#E74C3C' : '#4ECDC4',
                    borderRadius: 3,
                  }}
                />
              </FlexWidget>
            </FlexWidget>
          ))}
        </FlexWidget>
      )}

      {/* Top categories */}
      {data.topCategories.length > 0 && (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            marginTop: 8,
          }}
        >
          <TextWidget
            text="Top Categories"
            style={{ fontSize: 11, color: '#999999', marginBottom: 4 }}
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
                <TextWidget
                  text={cat.icon}
                  style={{ fontSize: 14, marginRight: 4 }}
                />
                <TextWidget
                  text={cat.name}
                  style={{ fontSize: 11, color: '#333333' }}
                />
              </FlexWidget>
              <TextWidget
                text={cat.amount}
                style={{ fontSize: 11, fontWeight: 'bold', color: '#1A1A2E' }}
              />
            </FlexWidget>
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
