import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/services/api';
import type { DrillDownLevel, ChartConfig, ChartDataPoint } from '@budget/shared-types';
import type { DrillDownResponse } from '@budget/shared-types';

export interface BreadcrumbItem {
  level: DrillDownLevel;
  label: string;
  id?: string;
}

interface DrillDownState {
  chartConfig: ChartConfig | null;
  transactions: DrillDownResponse['transactions'];
  breadcrumb: BreadcrumbItem[];
  isLoading: boolean;
  error: string | null;
}

interface DrillDownParams {
  startDate: string;
  endDate: string;
  currencyCode?: string;
}

export function useDrillDown(params: DrillDownParams) {
  const { t, i18n } = useTranslation();

  const localizeResponse = useCallback(
    (response: DrillDownResponse): DrillDownResponse => {
      const level = response.chart.drillDown?.currentLevel;
      const locale = i18n.language;

      // Localize chart title
      let title = response.chart.title;
      if (level === 'year') {
        title = t('drillDown.monthlySpending');
      } else if (level === 'month') {
        // Extract month name from breadcrumb (server sends English month name as 2nd item)
        const monthBreadcrumb = response.breadcrumb[1];
        const monthName = monthBreadcrumb?.id
          ? (() => {
              const [year, month] = monthBreadcrumb.id.split('-').map(Number);
              return new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(year, month - 1));
            })()
          : '';
        title = t('drillDown.weeklySpending', { month: monthName });
      } else if (level === 'week') {
        title = t('drillDown.dailySpending');
      } else if (level === 'day') {
        title = t('drillDown.transactions');
      }

      // Localize breadcrumb labels
      const breadcrumb = response.breadcrumb.map((item) => {
        if (item.level === 'month' && item.id) {
          const [year, month] = item.id.split('-').map(Number);
          return {
            ...item,
            label: new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(year, month - 1)),
          };
        }
        if (item.level === 'week' && item.id) {
          return { ...item, label: t('drillDown.weekLabel', { n: item.id }) };
        }
        if (item.level === 'day' && item.id) {
          const date = new Date(item.id);
          return {
            ...item,
            label: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date),
          };
        }
        return item;
      });

      return {
        ...response,
        chart: { ...response.chart, title },
        breadcrumb,
      };
    },
    [t, i18n.language],
  );

  const [state, setState] = useState<DrillDownState>({
    chartConfig: null,
    transactions: undefined,
    breadcrumb: [],
    isLoading: false,
    error: null,
  });

  const [history, setHistory] = useState<DrillDownState[]>([]);

  const fetchLevel = useCallback(
    async (level: DrillDownLevel, parentId?: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const raw = await api.drillDown({
          level,
          parentId,
          startDate: params.startDate,
          endDate: params.endDate,
          currencyCode: params.currencyCode,
          locale: i18n.language,
        });
        const response = localizeResponse(raw);

        setState({
          chartConfig: response.chart,
          transactions: response.transactions,
          breadcrumb: response.breadcrumb,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load data',
        }));
      }
    },
    [params.startDate, params.endDate, params.currencyCode],
  );

  const drillInto = useCallback(
    async (item: ChartDataPoint, nextLevel: DrillDownLevel) => {
      // Save current state to history for back navigation
      setHistory((prev) => [...prev, { ...state }]);

      // Compute new date range based on the selected item
      let newStartDate = params.startDate;
      let newEndDate = params.endDate;

      if (item.id) {
        // Parse date ranges from the item id
        if (nextLevel === 'month' && item.id.match(/^\d{4}-\d{2}$/)) {
          // id is "YYYY-MM"
          const [year, month] = item.id.split('-').map(Number);
          newStartDate = new Date(year, month - 1, 1).toISOString();
          newEndDate = new Date(year, month, 0).toISOString();
        } else if (nextLevel === 'week' && !isNaN(Number(item.id))) {
          // id is week number within current month
          const start = new Date(params.startDate);
          const weekNum = Number(item.id);
          const weekStart = new Date(start.getFullYear(), start.getMonth(), (weekNum - 1) * 7 + 1);
          const weekEnd = new Date(start.getFullYear(), start.getMonth(), Math.min(weekNum * 7, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()));
          newStartDate = weekStart.toISOString();
          newEndDate = weekEnd.toISOString();
        } else if (nextLevel === 'day' && item.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // id is "YYYY-MM-DD"
          newStartDate = new Date(item.id).toISOString();
          newEndDate = new Date(item.id + 'T23:59:59').toISOString();
        }
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const raw = await api.drillDown({
          level: nextLevel,
          parentId: item.id,
          startDate: newStartDate,
          endDate: newEndDate,
          currencyCode: params.currencyCode,
          locale: i18n.language,
        });
        const response = localizeResponse(raw);

        setState({
          chartConfig: response.chart,
          transactions: response.transactions,
          breadcrumb: response.breadcrumb,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load data',
        }));
      }
    },
    [state, params.startDate, params.endDate, params.currencyCode],
  );

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setState(previousState);
    setHistory((prev) => prev.slice(0, -1));
  }, [history]);

  const goToLevel = useCallback(
    (index: number) => {
      // Navigate back to a specific breadcrumb level
      if (index >= state.breadcrumb.length - 1) return; // Already at this level

      // Pop history back to that level
      const stepsBack = state.breadcrumb.length - 1 - index;
      if (stepsBack > 0 && history.length >= stepsBack) {
        const targetState = history[history.length - stepsBack];
        setState(targetState);
        setHistory((prev) => prev.slice(0, prev.length - stepsBack));
      }
    },
    [state.breadcrumb, history],
  );

  const initialize = useCallback(
    async (level: DrillDownLevel = 'year') => {
      setHistory([]);
      await fetchLevel(level);
    },
    [fetchLevel],
  );

  return {
    chartConfig: state.chartConfig,
    transactions: state.transactions,
    breadcrumb: state.breadcrumb,
    isLoading: state.isLoading,
    error: state.error,
    canGoBack: history.length > 0,
    drillInto,
    goBack,
    goToLevel,
    initialize,
  };
}
