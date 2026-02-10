import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { WidgetDataService } from '@/services/widgetData';
import { BudgetWidgetSmall } from './BudgetWidgetSmall';
import { BudgetWidgetMedium } from './BudgetWidgetMedium';
import { BudgetWidgetLarge } from './BudgetWidgetLarge';

const WIDGET_NAMES = {
  SMALL: 'BudgetWidgetSmall',
  MEDIUM: 'BudgetWidgetMedium',
  LARGE: 'BudgetWidgetLarge',
} as const;

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const widgetInfo = props.widgetInfo;
  const widgetName = widgetInfo.widgetName;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await WidgetDataService.getWidgetData();

      switch (widgetName) {
        case WIDGET_NAMES.SMALL:
          props.renderWidget(
            <BudgetWidgetSmall data={data ? WidgetDataService.toSmallData(data) : null} />,
          );
          break;
        case WIDGET_NAMES.MEDIUM:
          props.renderWidget(
            <BudgetWidgetMedium data={data ? WidgetDataService.toMediumData(data) : null} />,
          );
          break;
        case WIDGET_NAMES.LARGE:
          props.renderWidget(<BudgetWidgetLarge data={data} />);
          break;
        default:
          break;
      }
      break;
    }

    case 'WIDGET_DELETED':
      // Cleanup if needed
      break;

    case 'WIDGET_CLICK':
      // Click handled by clickAction="OPEN_APP" on FlexWidget
      break;

    default:
      break;
  }
}
