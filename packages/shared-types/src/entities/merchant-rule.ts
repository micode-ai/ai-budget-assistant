export interface MerchantCategoryRule {
  id: string;
  merchantNormalized: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantRuleReapplyGroup {
  categoryId: string;
  categoryName: string;
  count: number;
}

export interface MerchantRuleReapplyPreview {
  ruleId: string;
  merchantNormalized: string;
  targetCategoryId: string;
  targetCategoryName: string;
  /** Sum of every group's count — the total that would move if all groups stay checked. */
  totalCount: number;
  /** Sorted by count descending. Empty when there is nothing to reapply. */
  groups: MerchantRuleReapplyGroup[];
}
