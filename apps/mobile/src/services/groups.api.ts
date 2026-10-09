import type {
  CreateGroupDto,
  CreateGroupExpenseDto,
  CreateGroupSettlementDto,
  GroupActivityPage,
  GroupDetail,
  GroupJoinPreview,
  GroupMember,
  GroupSummary,
  JoinGroupDto,
  LinkGuestDto,
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
