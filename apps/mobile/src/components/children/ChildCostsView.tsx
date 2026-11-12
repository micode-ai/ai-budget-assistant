import React, { useState } from 'react';
import { useChildCosts } from '@/features/children/useChildCosts';
import { useChildStatement } from '@/features/children/useChildStatement';
import type { StatementGate } from '@/features/children/statementGate';
import { ChildCostsPhone } from './ChildCostsPhone';
import { ChildShareDialog } from './ChildShareDialog';
import { ChildStatementDialog } from './ChildStatementDialog';

/**
 * Native. `useChildCosts` is called HERE, the parent of the layout, and passed
 * down — the same shape as `ChildCostsView.web.tsx`, where the parent sits
 * above the 1024 split so a resize never remounts the data hook. The share
 * and statement dialogs live here too, so they survive a layout swap.
 */
export function ChildCostsView({ childId }: { childId: string }) {
  const costs = useChildCosts(childId);
  const [shareOpen, setShareOpen] = useState(false);
  // The statement flow lives here too, above the layout, so a request in flight survives a resize.
  const statement = useChildStatement(costs.child?.id ?? null);
  const [statementGate, setStatementGate] = useState<StatementGate | null>(null);
  const onStatement = () => {
    const gate = statement.quickGate();
    if (gate === 'pro') statement.showUpgrade();
    else setStatementGate(gate);
  };
  return (
    <>
      <ChildCostsPhone
        costs={costs}
        onShare={() => setShareOpen(true)}
        onStatement={onStatement}
        statementPro={statement.isPro}
      />
      {costs.child && costs.summary && (
        <ChildShareDialog
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          child={costs.child}
          summary={costs.summary}
          coverage={costs.coverage}
          currency={costs.currency}
          year={new Date().getFullYear()}
        />
      )}
      <ChildStatementDialog
        visible={statementGate !== null}
        onClose={() => setStatementGate(null)}
        statement={statement}
        gate={statementGate ?? 'ok'}
      />
    </>
  );
}
