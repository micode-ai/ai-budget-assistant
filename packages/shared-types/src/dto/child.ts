export interface CreateChildRequest {
  name: string;
  color?: string;
  clientId?: string;
}

export interface UpdateChildRequest {
  name?: string;
  color?: string;
  archived?: boolean;
}

export interface SetExpenseChildrenRequest {
  childIds: string[];
  shares?: number[];
}

export interface ChildSuggestionsResponse {
  /** productKey -> childId */
  [productKey: string]: string;
}

export interface ChildStatementRequest {
  childId: string;
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  locale: string;
  currencyCode: string;
}
