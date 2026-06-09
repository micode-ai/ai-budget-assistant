import { useMemo } from 'react';
import type { ProjectionPoint } from './useScenarioProjection';

export interface ChartPoint {
  value: number;
  label: string;
}

export function useScenarioChartData(projectionPoints: ProjectionPoint[]) {
  const chartData = useMemo(
    () => projectionPoints.map(p => ({ value: Math.max(0, p.currentCumulative), label: p.label })),
    [projectionPoints],
  );

  const chartData2 = useMemo(
    () => projectionPoints.map(p => ({ value: Math.max(0, p.scenarioCumulative), label: p.label })),
    [projectionPoints],
  );

  return { chartData, chartData2 };
}
