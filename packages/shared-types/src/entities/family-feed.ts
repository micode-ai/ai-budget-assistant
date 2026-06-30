export type FeedEventType =
  | 'EXPENSE_ADDED'
  | 'INCOME_ADDED'
  | 'PURCHASE_REQUEST_CREATED'
  | 'PURCHASE_REQUEST_APPROVED'
  | 'PURCHASE_REQUEST_PURCHASED'
  | 'PURCHASE_REQUEST_REJECTED';

export interface FamilyFeedEvent {
  id: string;
  accountId: string;
  userId: string;
  type: FeedEventType;
  entityId: string;
  metadata: { amount: number; currency: string; title?: string };
  createdAt: string;
  reactions: FeedReaction[];
}

export interface FeedReaction {
  id: string;
  eventId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface FeedGroup {
  id: string;
  type:
    | 'expenses'
    | 'incomes'
    | 'purchase_request_created'
    | 'purchase_request_approved'
    | 'purchase_request_purchased'
    | 'purchase_request_rejected';
  userId: string;
  userName: string;
  date: string; // 'YYYY-MM-DD' UTC
  // expense/income groups only:
  count?: number;
  totalAmount?: number;
  currency?: string;
  eventIds?: string[];
  // purchase_request cards only:
  purchaseRequest?: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    status: string;
  };
  // all types:
  reactions: { emoji: string; count: number; userIds: string[] }[];
  myReaction: string | null;
}
