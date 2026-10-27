import { useEffect, useState } from 'react';

/**
 * Drill-down state for a rolled-up category list. Resets to the top level whenever
 * the rows' array identity changes (period, account or currency change rebuilds it).
 */
export function useDrillParent<T>(rows: T[]) {
  const [drill, setDrill] = useState<{ rows: T[]; parentId: string | null }>({ rows, parentId: null });
  // A drill recorded against a previous array is ignored immediately, then cleared.
  const drillParentId = drill.rows === rows ? drill.parentId : null;
  useEffect(() => {
    if (drill.rows !== rows) setDrill({ rows, parentId: null });
  }, [rows, drill.rows]);
  return {
    drillParentId,
    setDrillParentId: (parentId: string | null) => setDrill({ rows, parentId }),
  };
}
