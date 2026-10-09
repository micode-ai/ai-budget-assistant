import type {
  Category,
  CreateGroupCashLinkDto,
  CreateGroupDto,
  CreateGroupExpenseDto,
  CreateGroupSettlementDto,
  GroupActivityPage,
  GroupBudgetLinksView,
  GroupBudgetMirrorView,
  GroupDetail,
  GroupExpenseItemsView,
  GroupFxPreview,
  GroupJoinPreview,
  GroupMember,
  GroupSummary,
  Expense,
  Income,
  JoinGroupDto,
  PaginatedResponse,
  LinkGuestDto,
  SetGroupBudgetMirrorDto,
  SetGroupClaimsDto,
  UpdateGroupDto,
  UpdateGroupExpenseDto,
  UpdateGroupMemberDto,
} from '@budget/shared-types';
import { httpClient } from './http-client';

const json = (body: unknown) => JSON.stringify(body);

/** Shared expense groups. Not account-scoped: the server ignores X-Account-Id here. */
export const groupsApi = {
  listGroups() {
    return httpClient.request<GroupSummary[]>('/groups');
  },
  createGroup(dto: CreateGroupDto) {
    return httpClient.request<GroupDetail>('/groups', { method: 'POST', body: json(dto) });
  },
  /** 404 for an unknown, disabled or deleted link. */
  previewGroupJoin(guestToken: string) {
    return httpClient.request<GroupJoinPreview>(`/groups/preview?guestToken=${encodeURIComponent(guestToken)}`);
  },
  joinGroup(dto: JoinGroupDto) {
    return httpClient.request<GroupDetail>('/groups/join', { method: 'POST', body: json(dto) });
  },
  /**
   * 409 ALREADY_MEMBER (its `details` offer a merge, ABA-657), 410 LINK_CODE_INVALID. With `merge: true`
   * after that 409, the guest row is folded into the caller's own row.
   */
  linkGuestGroup(dto: LinkGuestDto) {
    return httpClient.request<GroupDetail>('/groups/link-guest', { method: 'POST', body: json(dto) });
  },
  getGroup(groupId: string) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}`);
  },
  getGroupActivity(groupId: string, params: { before?: string; limit?: number } = {}) {
    const q = new URLSearchParams();
    if (params.before) q.set('before', params.before);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return httpClient.request<GroupActivityPage>(`/groups/${groupId}/activity${qs ? `?${qs}` : ''}`);
  },
  updateGroup(groupId: string, dto: UpdateGroupDto) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}`, { method: 'PATCH', body: json(dto) });
  },
  rotateGroupLink(groupId: string) {
    return httpClient.request<{ guestUrl: string }>(`/groups/${groupId}/rotate-link`, { method: 'POST' });
  },
  /** ABA-650. 409 OWNER_LIMIT / OWNER_CHANGED, 400 OWNER_TARGET_INVALID. */
  transferGroupOwner(groupId: string, memberId: string) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/owner`, { method: 'POST', body: json({ memberId }) });
  },
  /** ABA-651: the owner frees one guest's browser claim. 404 (foreign/app user/removed), 409 NOT_CLAIMED. */
  resetGroupMemberClaim(groupId: string, memberId: string) {
    return httpClient.request<GroupMember>(`/groups/${groupId}/members/${memberId}/reset-claim`, { method: 'POST' });
  },
  /**
   * ABA-657: `memberId` is absorbed into `intoMemberId` (the server keeps an app-user row and checks
   * consent). 403 MERGE_NOT_ALLOWED, 409 BOTH_APP_USERS / MERGE_CHANGED, 404 a stale member.
   */
  mergeGroupMember(groupId: string, memberId: string, intoMemberId: string) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/members/${memberId}/merge`, {
      method: 'POST',
      body: json({ intoMemberId }),
    });
  },
  /** ABA-650: take over an orphaned group. 409 GROUP_HAS_OWNER / OWNER_LIMIT. */
  adoptGroup(groupId: string) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/adopt`, { method: 'POST' });
  },
  archiveGroup(groupId: string, force?: boolean) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/archive`, {
      method: 'POST',
      body: json({ force }),
    });
  },
  deleteGroup(groupId: string) {
    return httpClient.request<void>(`/groups/${groupId}`, { method: 'DELETE' });
  },
  addGroupMember(groupId: string, displayName: string) {
    return httpClient.request<GroupMember>(`/groups/${groupId}/members`, {
      method: 'POST',
      body: json({ displayName }),
    });
  },
  updateGroupMember(groupId: string, memberId: string, dto: UpdateGroupMemberDto) {
    return httpClient.request<GroupMember>(`/groups/${groupId}/members/${memberId}`, {
      method: 'PATCH',
      body: json(dto),
    });
  },
  removeGroupMember(groupId: string, memberId: string) {
    return httpClient.request<void>(`/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
  },
  createGroupExpense(groupId: string, dto: CreateGroupExpenseDto) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/expenses`, { method: 'POST', body: json(dto) });
  },
  updateGroupExpense(groupId: string, expenseId: string, dto: UpdateGroupExpenseDto) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/expenses/${expenseId}`, {
      method: 'PATCH',
      body: json(dto),
    });
  },
  /** ABA-654: the provider rate for the form (1 `currency` in the group currency); `rate` null when unknown. */
  getGroupFxPreview(groupId: string, currency: string) {
    return httpClient.request<GroupFxPreview>(`/groups/${groupId}/fx-preview?currency=${encodeURIComponent(currency)}`);
  },
  /** ABA-656: an itemised expense's lines, claims, the caller's part and the claim window. */
  getGroupExpenseItems(groupId: string, expenseId: string) {
    return httpClient.request<GroupExpenseItemsView>(`/groups/${groupId}/expenses/${expenseId}/items`);
  },
  /** The caller's full set of claimed lines. 409 CLAIMS_CLOSED, 404 a foreign line. */
  setMyGroupClaims(groupId: string, expenseId: string, itemIds: string[]) {
    return httpClient.request<GroupExpenseItemsView>(`/groups/${groupId}/expenses/${expenseId}/claims/me`, {
      method: 'PUT',
      body: json({ itemIds }),
    });
  },
  /** Payer, creator or owner: set the listed members' claims and shares. 403 otherwise, 400 CLAIM_SHARE_INVALID. */
  setGroupClaims(groupId: string, expenseId: string, dto: SetGroupClaimsDto) {
    return httpClient.request<GroupExpenseItemsView>(`/groups/${groupId}/expenses/${expenseId}/claims`, {
      method: 'PUT',
      body: json(dto),
    });
  },
  /** Payer, creator or owner: close the claim window now, or `reopen` it for another 7 days. */
  closeGroupClaims(groupId: string, expenseId: string, reopen?: boolean) {
    return httpClient.request<GroupExpenseItemsView>(`/groups/${groupId}/expenses/${expenseId}/claims/close`, {
      method: 'POST',
      body: json(reopen ? { reopen: true } : {}),
    });
  },
  deleteGroupExpense(groupId: string, expenseId: string) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' });
  },
  createGroupSettlement(groupId: string, dto: CreateGroupSettlementDto) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/settlements`, {
      method: 'POST',
      body: json(dto),
    });
  },
  voidGroupSettlement(groupId: string, settlementId: string) {
    return httpClient.request<GroupDetail>(`/groups/${groupId}/settlements/${settlementId}`, {
      method: 'DELETE',
    });
  },
  // ---- Count my share in my budget (ABA-660 server, ABA-661 app) ----
  getGroupBudgetMirror(groupId: string) {
    return httpClient.request<GroupBudgetMirrorView>(`/groups/${groupId}/budget-mirror`);
  },
  /**
   * Turn on, or switch the account / category. 404 ACCOUNT_NOT_FOUND, 403 MIRROR_ACCOUNT_READ_ONLY /
   * MIRROR_ACCOUNT_ENCRYPTED / MIRROR_ACCOUNT_ARCHIVED, 404 CATEGORY_NOT_FOUND.
   */
  setGroupBudgetMirror(groupId: string, dto: SetGroupBudgetMirrorDto) {
    return httpClient.request<GroupBudgetMirrorView>(`/groups/${groupId}/budget-mirror`, {
      method: 'PUT',
      body: json(dto),
    });
  },
  /** Removes the share rows and unlinks every payment, in one transaction on the server. */
  deleteGroupBudgetMirror(groupId: string) {
    return httpClient.request<void>(`/groups/${groupId}/budget-mirror`, { method: 'DELETE' });
  },
  getGroupBudgetLinks(groupId: string) {
    return httpClient.request<GroupBudgetLinksView>(`/groups/${groupId}/budget-links`);
  },
  /** 409 MIRROR_OFF / LEG_ALREADY_LINKED / ROW_NOT_LINKABLE, 404 LEG_NOT_FOUND / ROW_NOT_FOUND, 400 LINK_INVALID. */
  createGroupBudgetLink(groupId: string, dto: CreateGroupCashLinkDto) {
    return httpClient.request<GroupBudgetLinksView>(`/groups/${groupId}/budget-links`, {
      method: 'POST',
      body: json(dto),
    });
  },
  acceptGroupBudgetSuggestion(groupId: string, suggestionId: string) {
    return httpClient.request<GroupBudgetLinksView>(
      `/groups/${groupId}/budget-links/suggestions/${suggestionId}/accept`,
      { method: 'POST' },
    );
  },
  rejectGroupBudgetSuggestion(groupId: string, suggestionId: string) {
    return httpClient.request<GroupBudgetLinksView>(
      `/groups/${groupId}/budget-links/suggestions/${suggestionId}/reject`,
      { method: 'POST' },
    );
  },
  /** Unlinking (even an automatic link) also stops that pair from being suggested again. */
  deleteGroupBudgetLink(groupId: string, linkId: string) {
    return httpClient.request<GroupBudgetLinksView>(`/groups/${groupId}/budget-links/${linkId}`, {
      method: 'DELETE',
    });
  },
  /**
   * Reads of the mirror's TARGET account, which need not be the current one: the account picker's
   * categories and the manual link's candidate rows. The explicit header wins over the current
   * account in `http-client.ts`; the server checks membership as for any account-scoped read.
   */
  getAccountCategoriesFor(accountId: string) {
    return httpClient.request<Category[]>('/categories', { headers: { 'X-Account-Id': accountId } });
  },
  getAccountExpensesFor(accountId: string, startDate: string, endDate: string) {
    const q = new URLSearchParams({ limit: '1000', startDate, endDate });
    return httpClient.request<PaginatedResponse<Expense>>(`/expenses?${q.toString()}`, {
      headers: { 'X-Account-Id': accountId },
    });
  },
  getAccountIncomesFor(accountId: string, startDate: string, endDate: string) {
    const q = new URLSearchParams({ limit: '1000', startDate, endDate });
    return httpClient.request<PaginatedResponse<Income>>(`/incomes?${q.toString()}`, {
      headers: { 'X-Account-Id': accountId },
    });
  },
};
