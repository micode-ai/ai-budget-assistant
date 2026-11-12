import React, { useState } from 'react';
import { useChildCosts } from '@/features/children/useChildCosts';
import { useChildStatement } from '@/features/children/useChildStatement';
import type { StatementGate } from '@/features/children/statementGate';
import { useIsDesktopWeb } from '../webLayout.constants';
import { ChildCostsPhone } from './ChildCostsPhone';
import { ChildShareDialog } from './ChildShareDialog';
import { ChildStatementDialog } from './ChildStatementDialog';
import { ChildCostsDesktop } from './desktop/ChildCostsDesktop';

/**
 * The one place that decides, on width alone (the `AnalyticsView.web.tsx`
 * rule). `useChildCosts` runs here, ABOVE the split, and is passed down: a
 * resize across 1024 swaps the child layout but never remounts the data hook
 * or closes the share dialog (desktop-chat-screen's rule).
 */
export function ChildCostsView({ childId }: { childId: string }) {
  const costs = useChildCosts(childId);
  const isDesktop = useIsDesktopWeb();
  const [shareOpen, setShareOpen] = useState(false);
  // The statement flow lives here too, above the layout, so a request in flight survives a resize.
  const statement = useChildStatement(costs.child?.id ?? null);
  const [statementGate, setStatementGate] = useState<StatementGate | null>(null);
  const onStatement = () => {
    const gate = statement.quickGate();
    if (gate === 'pro') statement.showUpgrade();
    else setStatementGate(gate);
  };
  const onShare = () => setShareOpen(true);
  return (
    <>
      {isDesktop ? (
        <ChildCostsDesktop costs={costs} onShare={onShare} onStatement={onStatement} statementPro={statement.isPro} />
      ) : (
        <ChildCostsPhone costs={costs} onShare={onShare} onStatement={onStatement} statementPro={statement.isPro} />
      )}
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
