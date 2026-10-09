import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { buildGuestPayLink } from '../receipt-split/helpers/guest-page';
import { GroupsService, MAX_MEMBERS, MAX_SHARES } from './groups.service';
import { SETTLE_METHODS } from './dto';
import type {
  GuestActivityView,
  GuestMemberView,
  GuestTransferView,
  GroupPageModel,
} from './helpers/group-guest-page';

/** Guest-surface logic (ABA-640). Ledger writes are delegated to GroupsService, never re-implemented. */

export const GUEST_COOKIE = 'abg_m';
export const GUEST_COOKIE_MAX_AGE_SECONDS = 34_560_000; // 400 days
export const WRITE_CEILING = 200;
/** One member's share of the group ceiling, so a single cookie cannot exhaust it for everyone. */
export const MEMBER_WRITE_CEILING = 60;
/** Guest joins have their own per-group cap: they are unauthenticated and must not eat the write budget. */
export const JOIN_CEILING = 30;
export const WRITE_WINDOW_MS = 3_600_000;
export const LINK_CODE_TTL_SECONDS = 600;
export const GUEST_PAGE_ACTIVITY = 50;

const SECRET_RE = /^[a-f0-9]{32}$/;
const RID_RE = /^[A-Za-z0-9_-]{8,64}$/;
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const guestLinkBase = () => process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl';

/**
 * CSRF / login-CSRF gate for the cookie-less POSTs (join, restore), which cannot carry a per-member
 * token.
 *
 * When the browser sends Sec-Fetch-Site it decides: only 'same-origin' passes. A page cannot forge
 * that header, so it is the authoritative answer. Only without it (older browsers, curl) does the
 * Origin header decide: absent passes, our own origin or the request's own Host passes, anything
 * else — including the opaque "null" — fails.
 *
 * Why Sec-Fetch-Site comes first: with `Referrer-Policy: no-referrer` a browser sends `Origin: null`
 * even on a same-origin form POST, which made the old Origin-first check refuse every real join
 * ("You can't do that", 2026-10-09). The page now uses `same-origin`, but the browser's own
 * judgement is the safer source either way.
 */
export function isTrustedRequestOrigin(headers: Record<string, string | string[] | undefined>): boolean {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const site = one(headers['sec-fetch-site']);
  if (site !== undefined) return site === 'same-origin';
  const origin = one(headers.origin);
  if (origin === undefined) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false; // includes the opaque "null" origin
  }
  let own: string | null = null;
  try {
    own = new URL(guestLinkBase()).origin;
  } catch {
    own = null;
  }
  const host = one(headers.host);
  return parsed.origin === own || (!!host && parsed.host === host);
}

/** What a guest request is allowed to know about its group. Scalar columns only, no relations. */
export interface GuestGroup {
  id: string;
  guestToken: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
  status: 'active' | 'archived';
  ledgerVersion: number;
}

export interface GuestActor {
  id: string;
  name: string;
  secret: string;
}

export type WriteCeiling = 'ok' | 'busy' | 'unavailable';

export const sha256Hex = (v: string) => createHash('sha256').update(v).digest('hex');

export const isValidSecret = (v: unknown): v is string => typeof v === 'string' && SECRET_RE.test(v);

/** The per-member CSRF value derivable only by someone who holds the cookie secret. */
export const csrfFor = (secret: string) => sha256Hex(`grp-csrf:${secret}`);

export function verifyCsrf(secret: string, supplied: unknown): boolean {
  if (typeof supplied !== 'string') return false;
  const expected = Buffer.from(csrfFor(secret));
  const got = Buffer.from(supplied);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

/** Trims, strips control characters and collapses whitespace. Returns null when empty or too long. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 1 || t.length > max) return null;
  return t;
}

export function parseAmount(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0.01 && n <= 1_000_000 ? n : null;
}

export function parseDate(v: unknown, today: string): string | null {
  const t = typeof v === 'string' && v.trim() ? v.trim() : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t ? null : t;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Maps a service exception to a flash code. '' = silent no-op (foreign id, nothing to say). */
export function flashFor(e: unknown): string {
  if (e instanceof NotFoundException) return '';
  if (e instanceof ConflictException) {
    const code = (e.getResponse() as { code?: string })?.code;
    if (code === 'LEDGER_CHANGED') return 'changed';
    if (code === 'MEMBER_NAME_TAKEN') return 'nameclash';
    return 'invalid';
  }
  if (e instanceof ForbiddenException) return 'forbidden';
  if (e instanceof BadRequestException) {
    const code = (e.getResponse() as { code?: string })?.code;
    if (code === 'EXPENSE_LIMIT' || code === 'GROUP_MEMBER_LIMIT') return 'limit';
    return 'invalid';
  }
  if (e instanceof HttpException) return 'invalid';
  throw e;
}

@Injectable()
export class GroupGuestService {
  private readonly logger = new Logger(GroupGuestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly groups: GroupsService,
  ) {}

  // ----------------------------------------------------------- identity

  /**
   * Query 1 of the two-step lookup: the group's own scalar columns by token, nothing else. An
   * unknown token, `guestAccess = false` and a deleted group (hard delete, so no row) all return
   * null, and the caller renders the byte-identical not-found page.
   */
  async findGroup(token: string): Promise<GuestGroup | null> {
    if (typeof token !== 'string' || token.length < 8 || token.length > 128) return null;
    const g = await this.prisma.expenseGroup.findUnique({
      where: { guestToken: token },
      select: {
        id: true,
        guestToken: true,
        name: true,
        emoji: true,
        currencyCode: true,
        status: true,
        guestAccess: true,
        ledgerVersion: true,
      },
    });
    if (!g || !g.guestAccess) return null;
    const { guestAccess: _ga, ...rest } = g;
    return rest as GuestGroup;
  }

  /** The acting member, from the cookie secret ONLY (hashed lookup, scoped to this group). */
  async identify(group: GuestGroup, secret: string | null): Promise<GuestActor | null> {
    if (!isValidSecret(secret)) return null;
    const m = await this.prisma.expenseGroupMember.findFirst({
      where: { groupId: group.id, claimTokenHash: sha256Hex(secret), removedAt: null },
      select: { id: true, displayName: true },
    });
    return m ? { id: m.id, name: m.displayName, secret } : null;
  }

  private async charge(key: string, limit: number): Promise<WriteCeiling> {
    try {
      const hits = await this.cache.incrementWindow(key, WRITE_WINDOW_MS);
      return hits > limit ? 'busy' : 'ok';
    } catch (e) {
      this.logger.warn(`guest ceiling unavailable for ${key}: ${(e as Error).message}`);
      return 'unavailable';
    }
  }

  /**
   * Hourly write ceilings, per member and then per group. Call ONLY after the actor and CSRF checks
   * have passed, so an anonymous or forged request never spends anyone's budget. The member bucket
   * is charged first and a member who is over theirs is refused without touching the group bucket.
   * Fails CLOSED: incrementWindow throws on a Redis outage.
   */
  async checkWriteCeiling(groupId: string, memberId: string): Promise<WriteCeiling> {
    const mine = await this.charge(`grp:w:${groupId}:${memberId}`, MEMBER_WRITE_CEILING);
    if (mine !== 'ok') return mine;
    return this.charge(`grp:w:${groupId}`, WRITE_CEILING);
  }

  /** Per-group hourly cap on guest joins (own bucket, never the write ceiling). Fails closed. */
  async checkJoinCeiling(groupId: string): Promise<WriteCeiling> {
    return this.charge(`grp:j:${groupId}`, JOIN_CEILING);
  }

  // -------------------------------------------------------------- page

  async buildPage(
    group: GuestGroup,
    actor: GuestActor | null,
    opts: { lang: string; flash: string | null; showAndroidAppButton: boolean; restoreCode: string | null; before?: string },
  ): Promise<GroupPageModel> {
    const [state, allMembers, activity] = await Promise.all([
      this.groups.loadState(group.id),
      this.prisma.expenseGroupMember.findMany({
        where: { groupId: group.id },
        select: {
          id: true,
          displayName: true,
          removedAt: true,
          userId: true,
          claimTokenHash: true,
          paymentMethod: true,
          paymentHandle: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.groups.getActivity(group.id, opts.before, GUEST_PAGE_ACTIVITY),
    ]);

    const names = new Map<string, string>(allMembers.map((m: any) => [m.id, m.displayName]));
    const byId = new Map<string, any>(allMembers.map((m: any) => [m.id, m]));
    const nameOf = (id: string) => names.get(id) ?? '?';
    const balanceOf = new Map<string, number>(state.ledger.balances.map((b) => [b.memberId, b.netAmount]));

    const members: GuestMemberView[] = state.members.map((m: any) => ({
      id: m.id,
      name: m.displayName,
      balance: balanceOf.get(m.id) ?? 0,
    }));
    // Unclaimed placeholder: a live member nobody (guest or app user) has taken. Booleans only.
    const claimable = allMembers
      .filter((m: any) => !m.removedAt && !m.userId && !m.claimTokenHash)
      .map((m: any) => ({ id: m.id, name: m.displayName }));

    const transfers: GuestTransferView[] = state.ledger.suggestedTransfers.map((t) => {
      const iAmPayer = !!actor && t.fromMemberId === actor.id;
      const iAmReceiver = !!actor && t.toMemberId === actor.id;
      let pay: GuestTransferView['pay'] = null;
      if (iAmPayer) {
        // The creditor's handle appears only on the row where the viewer is the one paying.
        const creditor = byId.get(t.toMemberId);
        if (creditor?.paymentMethod && creditor?.paymentHandle) {
          const built = buildGuestPayLink(creditor.paymentMethod, creditor.paymentHandle, t.amount, group.currencyCode);
          if (built.paymentLink || built.instructions) {
            pay = {
              link: built.paymentLink,
              method: creditor.paymentMethod,
              handle: creditor.paymentHandle,
              textOnly: !built.paymentLink,
            };
          }
        }
      }
      return {
        fromId: t.fromMemberId,
        toId: t.toMemberId,
        fromName: nameOf(t.fromMemberId),
        toName: nameOf(t.toMemberId),
        amount: t.amount,
        canSettle: iAmPayer || iAmReceiver,
        iAmReceiver,
        pay,
      };
    });

    const items: GuestActivityView[] = activity.items.map((it) => {
      if (it.kind === 'expense') {
        const e = it.expense;
        return {
          kind: 'expense' as const,
          id: e.id,
          description: e.description,
          amount: e.amount,
          date: e.date,
          paidByName: nameOf(e.paidByMemberId),
          addedByName: e.createdByMemberId && e.createdByMemberId !== e.paidByMemberId ? nameOf(e.createdByMemberId) : null,
          deleted: !!e.deletedAt,
          canDelete: !!actor && e.createdByMemberId === actor.id,
        };
      }
      const s = it.settlement;
      return {
        kind: 'settlement' as const,
        id: s.id,
        fromName: nameOf(s.fromMemberId),
        toName: nameOf(s.toMemberId),
        amount: s.amount,
        voided: !!s.voidedAt,
        canVoid: !!actor && (s.recordedByMemberId === actor.id || s.toMemberId === actor.id),
      };
    });

    const meRow = actor ? byId.get(actor.id) : null;
    return {
      token: group.guestToken,
      lang: opts.lang,
      groupName: group.name,
      emoji: group.emoji,
      currencyCode: group.currencyCode,
      archived: group.status === 'archived',
      me: actor
        ? {
            id: actor.id,
            name: actor.name,
            csrf: csrfFor(actor.secret),
            paymentMethod: meRow?.paymentMethod ?? null,
            paymentHandle: meRow?.paymentHandle ?? null,
            restoreCode: opts.restoreCode,
          }
        : null,
      claimable,
      members,
      transfers,
      ledgerVersion: group.ledgerVersion,
      activity: items,
      nextBefore: activity.nextBefore,
      rid: randomBytes(8).toString('hex'),
      flash: opts.flash,
      showAndroidAppButton: opts.showAndroidAppButton,
      today: new Date().toISOString().slice(0, 10),
    };
  }

  // -------------------------------------------------------- identity writes

  /**
   * Claims an unclaimed placeholder (`memberId`) or creates a new guest member (`name`). Returns the
   * new device secret, or a flash code on failure.
   */
  async join(group: GuestGroup, body: Record<string, unknown>): Promise<{ secret: string } | { flash: string }> {
    const secret = randomBytes(16).toString('hex');
    const hash = sha256Hex(secret);
    const memberId = str(body.memberId);
    if (memberId) {
      // Atomic: the loser of a race, or a claimed / app-user / foreign / removed row, matches nothing.
      const res = await this.prisma.expenseGroupMember.updateMany({
        where: { id: memberId, groupId: group.id, userId: null, claimTokenHash: null, removedAt: null },
        data: { claimTokenHash: hash, claimedAt: new Date(), joinedVia: 'guest' },
      });
      return res.count === 1 ? { secret } : { flash: 'taken' };
    }
    const name = cleanText(body.name, 40);
    if (!name) return { flash: 'invalid' };
    try {
      await this.groups.createMember(group.id, name, null, hash);
      return { secret };
    } catch (e) {
      return { flash: flashFor(e) || 'invalid' };
    }
  }

  /** Device restore: the secret must hash to a live member of THIS group. */
  async restore(group: GuestGroup, secret: string): Promise<boolean> {
    return !!(await this.identify(group, secret));
  }

  async forget(group: GuestGroup, actor: GuestActor): Promise<void> {
    await this.prisma.expenseGroupMember.updateMany({
      where: { id: actor.id, groupId: group.id },
      data: { claimTokenHash: null, claimedAt: null },
    });
  }

  // ---------------------------------------------------------- ledger writes

  /** Each returns a flash code ('' = silent). Ledger math and id re-scoping live in GroupsService. */
  async addExpense(group: GuestGroup, actor: GuestActor, body: Record<string, unknown>): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    const rid = str(body.rid);
    const description = cleanText(body.description, 120);
    const amount = parseAmount(body.amount);
    const date = parseDate(body.date, today);
    const paidBy = str(body.paidBy);
    const splitType = body.splitType === 'exact' ? 'exact' : body.splitType === 'equal' ? 'equal' : null;
    if (!rid || !RID_RE.test(rid) || !description || amount === null || !date || !paidBy || !splitType) return 'invalid';

    // Only fields of LIVE members of this group are ever read, so a planted foreign id is ignored.
    const live = await this.prisma.expenseGroupMember.findMany({
      where: { groupId: group.id, removedAt: null },
      select: { id: true },
    });
    if (!live.some((m: { id: string }) => m.id === paidBy)) return '';
    const shares: { memberId: string; value?: number }[] = [];
    for (const m of live as { id: string }[]) {
      if (splitType === 'equal') {
        if (body[`inc_${m.id}`] !== undefined) shares.push({ memberId: m.id });
      } else {
        const v = parseAmount(body[`amt_${m.id}`]);
        if (v !== null) shares.push({ memberId: m.id, value: v });
      }
    }
    if (shares.length === 0 || shares.length > MAX_SHARES) return 'invalid';

    try {
      await this.groups.createExpense(group.id, actor.id, {
        clientRequestId: rid,
        description,
        amount,
        date,
        paidByMemberId: paidBy,
        splitType,
        shares,
      });
      return 'added';
    } catch (e) {
      return flashFor(e);
    }
  }

  /** A guest may delete only an expense THEY created (stricter than the app's creator/payer/owner). */
  async deleteExpense(group: GuestGroup, actor: GuestActor, expenseId: string): Promise<string> {
    const own = await this.prisma.groupExpense.findFirst({
      where: { id: expenseId, groupId: group.id, deletedAt: null, createdByMemberId: actor.id },
      select: { id: true },
    });
    if (!own) return '';
    try {
      await this.groups.deleteExpense(group.id, actor.id, own.id);
      return '';
    } catch (e) {
      return flashFor(e);
    }
  }

  /** Same validation as the app: from-or-to, current suggested transfer, CAS on `v`. */
  async settle(group: GuestGroup, actor: GuestActor, body: Record<string, unknown>): Promise<string> {
    const rid = str(body.rid);
    const from = str(body.fromMemberId);
    const to = str(body.toMemberId);
    const amount = parseAmount(body.amount);
    const v = typeof body.v === 'string' && /^\d{1,9}$/.test(body.v) ? Number(body.v) : null;
    if (!rid || !RID_RE.test(rid) || !from || !to || amount === null || v === null) return 'invalid';
    try {
      await this.groups.createSettlement(group.id, actor.id, {
        clientRequestId: rid,
        fromMemberId: from,
        toMemberId: to,
        amount,
        ledgerVersion: v,
      });
      return 'settled';
    } catch (e) {
      return flashFor(e);
    }
  }

  async voidSettlement(group: GuestGroup, actor: GuestActor, settlementId: string): Promise<string> {
    // Recorder or receiver only: stricter than GroupsService, which also lets the owner void.
    const s = await this.prisma.groupSettlement.findFirst({
      where: {
        id: settlementId,
        groupId: group.id,
        voidedAt: null,
        OR: [{ recordedByMemberId: actor.id }, { toMemberId: actor.id }],
      },
      select: { id: true },
    });
    if (!s) return '';
    try {
      await this.groups.voidSettlement(group.id, actor.id, s.id);
      return '';
    } catch (e) {
      return flashFor(e);
    }
  }

  async savePaymentInfo(group: GuestGroup, actor: GuestActor, body: Record<string, unknown>): Promise<string> {
    const rawMethod = str(body.paymentMethod) ?? '';
    if (rawMethod !== '' && !(SETTLE_METHODS as readonly string[]).includes(rawMethod)) return 'invalid';
    const rawHandle = str(body.paymentHandle) ?? '';
    const handle = rawHandle.trim() === '' ? null : cleanText(rawHandle, 64);
    if (rawHandle.trim() !== '' && handle === null) return 'invalid';
    try {
      // Self only: the target is the acting member, never a form field.
      await this.groups.updateMember(group.id, actor.id, actor.id, {
        paymentMethod: (rawMethod === '' ? null : rawMethod) as any,
        paymentHandle: rawMethod === '' ? null : handle,
      });
      return 'saved';
    } catch (e) {
      return flashFor(e);
    }
  }

  // ------------------------------------------------------------- link code

  /**
   * Mints a single-use code bound to this guest member. `CacheService.set` swallows Redis errors, so
   * the write is read back: a code that never landed must not be handed out.
   */
  async mintLinkCode(group: GuestGroup, actor: GuestActor): Promise<string | null> {
    const code = randomBytes(16).toString('hex');
    const key = `grp:link:${code}`;
    await this.cache.set(key, { groupId: group.id, memberId: actor.id, guestToken: group.guestToken }, LINK_CODE_TTL_SECONDS);
    const stored = await this.cache.get<{ groupId: string }>(key);
    return stored ? code : null;
  }
}

export { MAX_MEMBERS };

// ------------------------------------------------------------------ cookies

/** Reads one cookie from the raw Cookie header (cookie-parser is not installed). */
export function readCookie(header: string | undefined, name: string): string | null {
  if (typeof header !== 'string' || header.length > 4096) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** `Path` is scoped to this one group, so a guest in two groups holds two independent cookies. */
export function buildSetCookie(token: string, secret: string | null): string {
  const base = `${GUEST_COOKIE}=${secret ?? ''}; Path=/g/${token}; HttpOnly; Secure; SameSite=Lax`;
  return secret ? `${base}; Max-Age=${GUEST_COOKIE_MAX_AGE_SECONDS}` : `${base}; Max-Age=0`;
}
