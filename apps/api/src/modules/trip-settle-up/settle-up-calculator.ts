export interface ShareInput {
  expenseId: string;
  paidByUserId: string;
  amountInAccountCurrency: number;
  shares: { userId: string; shareAmount: number }[];
}

export interface Balance {
  userId: string;
  netAmount: number; // positive = is owed money, negative = owes money
}

export interface SuggestedTransfer {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeBalances(expenses: ShareInput[]): Balance[] {
  const net = new Map<string, number>();
  for (const exp of expenses) {
    net.set(exp.paidByUserId, round2((net.get(exp.paidByUserId) ?? 0) + exp.amountInAccountCurrency));
    for (const share of exp.shares) {
      net.set(share.userId, round2((net.get(share.userId) ?? 0) - share.shareAmount));
    }
  }
  return Array.from(net.entries()).map(([userId, netAmount]) => ({ userId, netAmount }));
}

export function simplifyDebts(balances: Balance[]): SuggestedTransfer[] {
  const creditors = balances
    .filter((b) => b.netAmount > 0.005)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netAmount - a.netAmount);
  const debtors = balances
    .filter((b) => b.netAmount < -0.005)
    .map((b) => ({ userId: b.userId, netAmount: -b.netAmount }))
    .sort((a, b) => b.netAmount - a.netAmount);

  const transfers: SuggestedTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.netAmount, creditor.netAmount));
    if (amount > 0.005) {
      transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    }
    debtor.netAmount = round2(debtor.netAmount - amount);
    creditor.netAmount = round2(creditor.netAmount - amount);
    if (debtor.netAmount <= 0.005) i++;
    if (creditor.netAmount <= 0.005) j++;
  }
  return transfers;
}
