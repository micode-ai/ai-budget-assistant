import type {
  CreateGroupDto,
  CreateGroupExpenseDto,
  CreateGroupSettlementDto,
  GroupActivityPage,
  GroupDetail,
  GroupExpenseItemsView,
  GroupFxPreview,
  GroupJoinPreview,
  GroupMember,
  GroupSummary,
  JoinGroupDto,
  LinkGuestDto,
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
  /** 409 ALREADY_MEMBER, 410 LINK_CODE_INVALID. */
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
};
