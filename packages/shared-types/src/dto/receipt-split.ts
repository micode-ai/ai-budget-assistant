/** One participant the payer is asking to settle up. */
export interface SplitParticipantInput {
  name: string;
  /** Ids of the expense_items assigned to this person. Empty = an equal-split share. */
  itemIds?: string[];
}

export interface CreateSplitDto {
  participants: SplitParticipantInput[];
  /** 'items' assigns line items; 'equal' divides the whole bill among payer + participants. */
  mode: 'items' | 'equal';
}

export type SplitParticipantStatus = 'sent' | 'opened' | 'claimed' | 'settled';

export interface SplitParticipantState {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  status: SplitParticipantStatus;
  /** The shareable URL. Present only to the payer, never on the guest page. */
  url: string;
}

export interface SplitStateResponse {
  expenseId: string;
  /** The payer's own remainder — bill total minus the sum of participant shares. */
  ownShare: number;
  currencyCode: string;
  participants: SplitParticipantState[];
}
