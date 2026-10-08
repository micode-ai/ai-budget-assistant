import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { resolveGuestLang } from '../receipt-split/helpers/guest-page-i18n';
import { getGroupGuestStrings } from './helpers/group-guest-page-i18n';
import {
  FLASH_CODES,
  renderGroupActivityPage,
  renderGroupBusyPage,
  renderGroupNotFoundPage,
  renderGroupPage,
  type CtaMoment,
} from './helpers/group-guest-page';
import {
  buildSetCookie,
  GroupGuestService,
  GUEST_COOKIE,
  isTrustedRequestOrigin,
  isValidSecret,
  readCookie,
  verifyCsrf,
  type GuestActor,
  type GuestGroup,
} from './group-guest.service';

/**
 * The public, unauthenticated guest surface of an expense group (ABA-640): `/g/:token`. A sibling
 * of `GuestController` (`s/`) and `ShoppingListGuestController` (`sl/`), NOT part of either: this
 * page deliberately shows every member's name and balance, which `GuestController`'s own
 * invariant forbids. Excluded from `/api/v1` by the `'g/(.*)'` wildcard.
 *
 * Posture: the group comes from the token, the acting member from the cookie secret (stored as
 * sha256) and NEVER from a form field; every write re-checks a per-member CSRF field, the
 * per-member and per-group hourly write ceilings (charged after the actor + CSRF checks, fail closed) and answers with a 303 back to the page.
 */

/**
 * `form-action` carries the two link-handoff destinations because Chrome enforces it on the
 * redirect that follows a form POST: without them `POST /g/:token/link` would be blocked.
 */
export const GROUP_GUEST_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://app.ai-budget.pl budget:; frame-ancestors 'none'; base-uri 'none'";

const WEB_LINK_BASE = 'https://app.ai-budget.pl/groups/link';
const APP_LINK_BASE = 'budget://groups/link';
const CTA_MOMENTS: CtaMoment[] = ['added', 'form', 'settled'];

const bodyOf = (b: unknown): Record<string, unknown> =>
  b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};

type Pipeline = (group: GuestGroup, actor: GuestActor, body: Record<string, unknown>) => Promise<string>;

@Controller('g')
export class GroupGuestController {
  constructor(private readonly svc: GroupGuestService) {}

  // ---------------------------------------------------------------- plumbing

  private headers(res: Response): void {
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': GROUP_GUEST_CSP,
      'X-Content-Type-Options': 'nosniff',
    });
  }

  private html(res: Response, status: number, body: string): void {
    this.headers(res);
    res.status(status).type('text/html; charset=utf-8').send(body);
  }

  /** One body for unknown / guestAccess=false / deleted, so the three are indistinguishable. */
  private notFound(req: Request, res: Response): void {
    this.html(res, 404, renderGroupNotFoundPage(getGroupGuestStrings(resolveGuestLang(req))));
  }

  private busy(req: Request, res: Response, status: number): void {
    this.html(res, status, renderGroupBusyPage(getGroupGuestStrings(resolveGuestLang(req))));
  }

  private redirect(res: Response, group: GuestGroup, lang: string, flash?: string, cta?: CtaMoment): void {
    const q = new URLSearchParams({ lang });
    if (flash) q.set('f', flash);
    if (cta) q.set('cta', cta);
    this.headers(res);
    res.redirect(303, `/g/${group.guestToken}?${q.toString()}`);
  }

  private cookieSecret(req: Request): string | null {
    const v = readCookie(req.headers.cookie, GUEST_COOKIE);
    return isValidSecret(v) ? v : null;
  }

  private isAndroid(req: Request): boolean {
    return /Android/i.test(String(req.headers['user-agent'] ?? ''));
  }

  /**
   * The shared POST path: usable group -> not archived -> cookie member -> CSRF -> write ceiling ->
   * `run`. Every refusal is a 303 (or the not-found / busy page), never a distinguishing error.
   */
  private async guarded(
    token: string,
    req: Request,
    res: Response,
    body: unknown,
    run: Pipeline,
    after?: (flash: string) => CtaMoment | undefined,
  ): Promise<void> {
    const lang = resolveGuestLang(req);
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    if (group.status === 'archived') return this.redirect(res, group, lang, 'forbidden');
    const actor = await this.svc.identify(group, this.cookieSecret(req));
    const b = bodyOf(body);
    if (!actor || !verifyCsrf(actor.secret, b.csrf)) return this.redirect(res, group, lang);
    const ceiling = await this.svc.checkWriteCeiling(group.id, actor.id);
    if (ceiling !== 'ok') return this.busy(req, res, ceiling === 'busy' ? 429 : 503);
    const flash = await run(group, actor, b);
    this.redirect(res, group, lang, flash || undefined, after?.(flash));
  }

  // ------------------------------------------------------------------- reads

  @Get(':token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async page(
    @Param('token') token: string,
    @Query('f') f: unknown,
    @Query('cta') cta: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    const strings = getGroupGuestStrings(resolveGuestLang(req));
    const actor = await this.svc.identify(group, this.cookieSecret(req));
    const flash = typeof f === 'string' && FLASH_CODES.includes(f) ? f : null;
    const moment = typeof cta === 'string' && (CTA_MOMENTS as string[]).includes(cta) ? (cta as CtaMoment) : null;
    const model = await this.svc.buildPage(group, actor, {
      lang: strings.lang,
      flash,
      showAndroidAppButton: this.isAndroid(req),
      // The personal restore code is shown once, on the render right after joining.
      restoreCode: actor && flash === 'joined' ? actor.secret : null,
    });
    this.html(res, 200, renderGroupPage(model, strings, actor ? moment : null));
  }

  @Get(':token/activity')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async activity(
    @Param('token') token: string,
    @Query('before') before: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    const strings = getGroupGuestStrings(resolveGuestLang(req));
    const cursor = typeof before === 'string' && !Number.isNaN(Date.parse(before)) ? before : undefined;
    const model = await this.svc.buildPage(group, null, {
      lang: strings.lang,
      flash: null,
      showAndroidAppButton: false,
      restoreCode: null,
      before: cursor,
    });
    this.html(res, 200, renderGroupActivityPage(model, strings));
  }

  // ------------------------------------------------------------------ writes

  /**
   * The cookie-minting POSTs (join, restore) cannot carry a per-member CSRF token, so they refuse a
   * cross-site request, and never replace a cookie that already resolves to a live member of this
   * group (login CSRF / session fixation). Returns true when it has already responded.
   */
  private async refuseUnsafeCookieWrite(
    group: GuestGroup,
    req: Request,
    res: Response,
    lang: string,
  ): Promise<boolean> {
    if (!isTrustedRequestOrigin(req.headers)) {
      this.redirect(res, group, lang, 'forbidden');
      return true;
    }
    if (await this.svc.identify(group, this.cookieSecret(req))) {
      this.redirect(res, group, lang, 'alreadyin');
      return true;
    }
    return false;
  }

  /** The only POST without a cookie: it creates one. Archived groups accept no new members. */
  @Post(':token/join')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async join(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const lang = resolveGuestLang(req);
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    if (group.status === 'archived') return this.redirect(res, group, lang, 'forbidden');
    if (await this.refuseUnsafeCookieWrite(group, req, res, lang)) return;
    const ceiling = await this.svc.checkJoinCeiling(group.id);
    if (ceiling !== 'ok') return this.busy(req, res, ceiling === 'busy' ? 429 : 503);
    const out = await this.svc.join(group, bodyOf(body));
    if ('flash' in out) return this.redirect(res, group, lang, out.flash);
    res.append('Set-Cookie', buildSetCookie(group.guestToken, out.secret));
    this.redirect(res, group, lang, 'joined');
  }

  /**
   * Device restore. The restore code (the device secret) arrives in the POST BODY, never the URL,
   * so it stays out of access logs, history and Sentry, and nothing mutates on a GET.
   */
  @Post(':token/restore')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async restore(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const lang = resolveGuestLang(req);
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    if (await this.refuseUnsafeCookieWrite(group, req, res, lang)) return;
    const raw = bodyOf(body).code;
    const code = typeof raw === 'string' ? raw.trim().toLowerCase() : null;
    if (!isValidSecret(code) || !(await this.svc.restore(group, code))) {
      return this.redirect(res, group, lang, 'badcode');
    }
    res.append('Set-Cookie', buildSetCookie(group.guestToken, code));
    this.redirect(res, group, lang);
  }

  @Post(':token/expenses')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  addExpense(@Param('token') token: string, @Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    return this.guarded(
      token,
      req,
      res,
      body,
      (g, a, b) => this.svc.addExpense(g, a, b),
      (f) => (f === 'added' ? 'added' : undefined),
    );
  }

  @Post(':token/expenses/:expenseId/delete')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  deleteExpense(
    @Param('token') token: string,
    @Param('expenseId') expenseId: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.guarded(token, req, res, body, (g, a) => this.svc.deleteExpense(g, a, expenseId));
  }

  @Post(':token/settle')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  settle(@Param('token') token: string, @Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    return this.guarded(
      token,
      req,
      res,
      body,
      (g, a, b) => this.svc.settle(g, a, b),
      (f) => (f === 'settled' ? 'settled' : undefined),
    );
  }

  @Post(':token/settlements/:settlementId/void')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  voidSettlement(
    @Param('token') token: string,
    @Param('settlementId') settlementId: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.guarded(token, req, res, body, (g, a) => this.svc.voidSettlement(g, a, settlementId));
  }

  @Post(':token/payment-info')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  paymentInfo(@Param('token') token: string, @Body() body: unknown, @Req() req: Request, @Res() res: Response) {
    return this.guarded(token, req, res, body, (g, a, b) => this.svc.savePaymentInfo(g, a, b));
  }

  /**
   * Mints a single-use app-link code for THIS cookie member and hands off to a CONSTANT base, only
   * the code is appended (no open redirect). `app` is honoured on an Android user agent only.
   */
  @Post(':token/link')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async link(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const lang = resolveGuestLang(req);
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    const actor = await this.svc.identify(group, this.cookieSecret(req));
    const b = bodyOf(body);
    if (!actor || !verifyCsrf(actor.secret, b.csrf)) return this.redirect(res, group, lang);
    const ceiling = await this.svc.checkWriteCeiling(group.id, actor.id);
    if (ceiling !== 'ok') return this.busy(req, res, ceiling === 'busy' ? 429 : 503);
    const code = await this.svc.mintLinkCode(group, actor);
    if (!code) return this.redirect(res, group, lang, 'linkfailed');
    const url =
      b.target === 'app' && this.isAndroid(req)
        ? `${APP_LINK_BASE}?code=${code}`
        : `${WEB_LINK_BASE}?code=${code}&src=group&loc=guest_link`;
    this.headers(res);
    res.redirect(303, url);
  }

  /** "Not me / forget this device": clears the cookie and this member's claim. Allowed when archived. */
  @Post(':token/forget')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async forget(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const lang = resolveGuestLang(req);
    const group = await this.svc.findGroup(token);
    if (!group) return this.notFound(req, res);
    const actor = await this.svc.identify(group, this.cookieSecret(req));
    if (!actor || !verifyCsrf(actor.secret, bodyOf(body).csrf)) return this.redirect(res, group, lang);
    await this.svc.forget(group, actor);
    res.append('Set-Cookie', buildSetCookie(group.guestToken, null));
    this.redirect(res, group, lang);
  }
}
