import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountRole, AccountType, OAuthClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { MailService } from '../mail/mail.service';
import { OAuthClientsService } from './oauth-clients.service';
import { OAuthGrantsService } from './oauth-grants.service';
import { InvalidScopeError, parseScopeParam, type PublicScope } from './oauth-scopes';
import { generateToken, sha256Hex } from './oauth-crypto.util';
import { OAUTH_CODE_TTL_SEC, oauthCodeKey, type OAuthCodePayload } from './oauth-code';
import { InvalidTargetError, assertClientResource, parseResourceParam } from './oauth-resource.util';
import { assertScopesAllowedForClient, defaultScopesForClient } from './oauth-scope-policy';
import type { AuthorizeApproveDto, AuthorizePreviewQueryDto } from './dto/authorize.dto';

export const CONNECTED_APPS_URL = 'https://app.ai-budget.pl/settings/connected-apps';

/** The "app connected" e-mail goes out at most once per (app, account) per this many seconds. */
const CONNECTED_MAIL_DEDUPE_SEC = 86_400;

/** An S256 challenge is base64url(SHA-256) without padding: exactly 43 characters. */
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export type AuthorizeErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_redirect_uri'
  | 'invalid_scope'
  | 'invalid_target'
  | 'unsupported_response_type';

export interface AuthorizePreviewAccount {
  id: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  selectable: boolean;
  reason: 'viewer' | 'encrypted' | null;
  readOnly: boolean;
  /** The account is in the caller's active grant for this client (re-consent pre-ticks it). */
  connected: boolean;
}

export interface AuthorizePreview {
  app: {
    name: string;
    logoUrl: string | null;
    homepageUrl: string | null;
    privacyPolicyUrl: string | null;
    isVerified: boolean;
    developerName: string | null;
    /**
     * Registered by an AI assistant through dynamic client registration (`source = 'mcp_dcr'`):
     * the consent page labels it and renders its self-declared name/URI/logo as untrusted text.
     */
    registeredByAssistant: boolean;
    /**
     * R11: for an assistant-registered client, the host of the validated `redirect_uri` of THIS
     * request in ASCII (punycode) form — where the code will actually be sent. The consent page
     * shows it prominently, because the name, homepage and logo are all self-declared. Null for a
     * manual (developer-registered) client.
     */
    redirectHost: string | null;
  };
  scopes: PublicScope[];
  accounts: AuthorizePreviewAccount[];
}

interface ValidatedRequest {
  client: OAuthClient;
  redirectUri: string;
  scopes: PublicScope[];
  codeChallenge: string;
  /** null = the public API; otherwise exactly `MCP_RESOURCE_URL`. */
  resource: string | null;
}

/**
 * The host of an already-validated redirect URI, ASCII-only: Node's WHATWG URL applies IDNA, so a
 * homograph host comes back as `xn--…`. IPv6 keeps its brackets. Null if it somehow fails to parse.
 */
export function redirectHostOf(uri: string): string | null {
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return /^[a-z0-9.:[\]-]+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** RFC 6749 error body. The consent SPA shows these on its own page — it never redirects them. */
function oauthError(error: AuthorizeErrorCode, description: string): BadRequestException {
  return new BadRequestException({ error, error_description: description });
}

/**
 * The authorize step of the OAuth flow, called by OUR consent SPA with the user's JWT — not by the
 * third party. Nothing here redirects; it returns the URL for the SPA to navigate to, and only
 * after `redirect_uri` has matched one of the client's registered URIs exactly.
 *
 * Apps are user-scoped, not account-scoped, so there is no AccountContextGuard: the account is a
 * body field, and approve checks the caller's own membership and role on it directly.
 */
@Injectable()
export class OAuthAuthorizeService {
  private readonly logger = new Logger(OAuthAuthorizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: OAuthClientsService,
    private readonly grants: OAuthGrantsService,
    private readonly cache: CacheService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async preview(userId: string, q: AuthorizePreviewQueryDto): Promise<AuthorizePreview> {
    const { client, scopes, redirectUri } = await this.validate(q, { check: true, value: q.response_type });

    const [developer, memberships, connectedRows] = await Promise.all([
      // Owner-less (dynamic-registration) clients have no publisher to show.
      client.ownerUserId
        ? this.prisma.user.findUnique({ where: { id: client.ownerUserId }, select: { name: true } })
        : Promise.resolve(null),
      this.prisma.accountMember.findMany({
        where: { userId, account: { isActive: true } },
        include: { account: { select: { id: true, name: true, type: true, encryptionTier: true } } },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.oAuthGrantAccount.findMany({
        where: { grant: { clientId: client.id, userId, revokedAt: null } },
        select: { accountId: true },
      }),
    ]);
    const connected = new Set(connectedRows.map((r) => r.accountId));

    return {
      app: {
        name: client.name,
        logoUrl: client.logoUrl,
        homepageUrl: client.homepageUrl,
        privacyPolicyUrl: client.privacyPolicyUrl,
        isVerified: client.isVerified,
        developerName: developer?.name ?? null,
        registeredByAssistant: client.source === 'mcp_dcr',
        redirectHost: client.source === 'mcp_dcr' ? redirectHostOf(redirectUri) : null,
      },
      scopes,
      accounts: memberships.map((m) => {
        const encrypted = m.account.encryptionTier >= 2;
        const viewer = m.role === 'viewer';
        return {
          id: m.account.id,
          name: m.account.name,
          type: m.account.type,
          role: m.role,
          selectable: !encrypted && !viewer,
          reason: encrypted ? 'encrypted' : viewer ? 'viewer' : null,
          readOnly: m.account.encryptionTier === 1,
          connected: connected.has(m.account.id),
        };
      }),
    };
  }

  async approve(userId: string, dto: AuthorizeApproveDto): Promise<{ redirectTo: string }> {
    if (dto.decision === 'deny') {
      // Only the redirect target needs proving before we send the user there.
      const { redirectUri } = await this.validateClientAndRedirect(dto.client_id, dto.redirect_uri);
      return { redirectTo: buildRedirect(redirectUri, { error: 'access_denied' }, dto.state) };
    }

    const req = await this.validate(dto, { check: false });
    // `account_ids` is the multi-account form; `account_id` is the phase 1 single-account form.
    const accountIds = [...new Set(dto.account_ids ?? (dto.account_id ? [dto.account_id] : []))];
    if (accountIds.length === 0) throw oauthError('invalid_request', 'account_ids is required');

    // Every requested account is checked; any failure refuses the whole approve (no partial grant).
    const memberships: {
      role: AccountRole;
      account: { id: string; name: string };
      user: { name: string; email: string; language: string };
    }[] = [];
    for (const accountId of accountIds) {
      const membership = await this.prisma.accountMember.findFirst({
        where: { userId, accountId, account: { isActive: true } },
        include: {
          account: { select: { id: true, name: true, encryptionTier: true } },
          user: { select: { name: true, email: true, language: true } },
        },
      });
      if (!membership) {
        throw new ForbiddenException({ error: 'access_denied', error_description: 'not a member of this account' });
      }
      if (membership.role !== 'owner' && membership.role !== 'editor') {
        throw new ForbiddenException({ error: 'access_denied', error_description: 'only an owner or editor can connect an app' });
      }
      if (membership.account.encryptionTier >= 2) {
        throw new ForbiddenException({ error: 'account_encrypted', error_description: 'this account is end-to-end encrypted' });
      }
      memberships.push(membership);
    }

    const { grant, addedAccountIds } = await this.grants.replaceActive(req.client.id, userId, accountIds, req.scopes);

    // Newly connected accounts are real connections (they show in Connected apps) whether or not the
    // code below is stored, so the e-mail goes out here; a retry after a failed store adds nothing new.
    if (addedAccountIds.length > 0) {
      const added = memberships
        .filter((m) => addedAccountIds.includes(m.account.id))
        .map((m) => ({ id: m.account.id, name: m.account.name, grantorRole: m.role }));
      void this.notifyConnected({
        clientDbId: req.client.id,
        appName: req.client.name,
        grantorId: userId,
        grantor: memberships[0].user,
        added,
      }).catch(logFireAndForget(this.logger, 'OAuthAuthorizeService.notifyConnected'));
    }

    const code = generateToken('aba_ac_');
    const payload: OAuthCodePayload = {
      grantId: grant.id,
      clientDbId: req.client.id,
      redirectUri: req.redirectUri,
      codeChallenge: req.codeChallenge,
      scopes: req.scopes,
      // Only an MCP-bound code carries the key: a public-API code stays exactly as before.
      ...(req.resource !== null ? { resource: req.resource } : {}),
    };
    try {
      await this.cache.setStrict(oauthCodeKey(sha256Hex(code)), payload, OAUTH_CODE_TTL_SEC);
    } catch (e) {
      // Never hand out a code that was not stored: the third party would hit invalid_grant.
      this.logger.warn(`authorization code store failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException({
        error: 'temporarily_unavailable',
        error_description: 'please try again',
      });
    }

    return { redirectTo: buildRedirect(req.redirectUri, { code }, dto.state) };
  }

  /**
   * Order: client + redirect first (an error there can never be redirected), then response_type
   * (preview only — approve's body has none), PKCE, scope, resource.
   *
   * Scope: a `mcp_dcr` client that names none gets `MCP_DEFAULT_SCOPES`, and may hold only the read
   * scopes; a manual client still has to name one and is unrestricted.
   *
   * Resource: a `mcp_dcr` client must name the MCP resource (ruling R4) — without it, `invalid_target`.
   */
  private async validate(
    q: {
      client_id?: string;
      redirect_uri?: string;
      scope?: string;
      code_challenge?: string;
      code_challenge_method?: string;
      resource?: string;
    },
    responseType: { check: false } | { check: true; value: string | undefined },
  ): Promise<ValidatedRequest> {
    const { client, redirectUri } = await this.validateClientAndRedirect(q.client_id, q.redirect_uri);
    if (responseType.check) {
      if (!responseType.value) throw oauthError('invalid_request', 'response_type is required');
      if (responseType.value !== 'code') throw oauthError('unsupported_response_type', 'response_type must be code');
    }
    if (!q.code_challenge) throw oauthError('invalid_request', 'code_challenge is required');
    if (q.code_challenge_method !== 'S256') {
      throw oauthError('invalid_request', 'code_challenge_method must be S256');
    }
    if (!S256_CHALLENGE.test(q.code_challenge)) {
      throw oauthError('invalid_request', 'code_challenge must be a base64url SHA-256 (43 characters)');
    }
    let scopes: PublicScope[];
    try {
      const fallback = (q.scope ?? '').trim() === '' ? defaultScopesForClient(client) : null;
      scopes = fallback ?? parseScopeParam(q.scope ?? '');
      assertScopesAllowedForClient(client, scopes);
    } catch (e) {
      if (e instanceof InvalidScopeError) throw oauthError('invalid_scope', e.message);
      throw e;
    }
    let resource: string | null;
    try {
      resource = parseResourceParam(q.resource, this.config);
      // R4: a registered assistant may only ever be authorized for /mcp.
      assertClientResource(client, resource);
    } catch (e) {
      if (e instanceof InvalidTargetError) throw oauthError('invalid_target', e.message);
      throw e;
    }
    return { client, redirectUri, scopes, codeChallenge: q.code_challenge, resource };
  }

  private async validateClientAndRedirect(
    clientId: string | undefined,
    redirectUri: string | undefined,
  ): Promise<{ client: OAuthClient; redirectUri: string }> {
    if (!clientId) throw oauthError('invalid_request', 'client_id is required');
    if (!redirectUri) throw oauthError('invalid_request', 'redirect_uri is required');
    const client = await this.clients.findActiveByClientId(clientId);
    if (!client || client.status === 'blocked') throw oauthError('invalid_client', 'unknown or blocked client');
    // Exact string equality with a registered URI — no prefix, normalisation or wildcard.
    if (!client.redirectUris.includes(redirectUri)) {
      throw oauthError('invalid_redirect_uri', 'redirect_uri is not registered for this client');
    }
    return { client, redirectUri };
  }

  /**
   * E-mails the grantor one message listing every newly connected account; for the accounts where
   * the grantor is an editor, each owner of them gets one message listing only the accounts they
   * own (spec section 9). At most once per (app, account) per day: connect, disconnect, connect must
   * not turn into a stream of e-mails. A Redis outage on the dedupe key sends anyway: a lost
   * security notice is worse than a duplicate.
   */
  private async notifyConnected(p: {
    clientDbId: string;
    appName: string;
    grantorId: string;
    grantor: { name: string; email: string; language: string };
    added: { id: string; name: string; grantorRole: AccountRole }[];
  }): Promise<void> {
    const surviving: typeof p.added = [];
    for (const a of p.added) {
      let first = true;
      try {
        first = await this.cache.setIfAbsentStrict(`oauth:mail:connected:${p.clientDbId}:${a.id}`, CONNECTED_MAIL_DEDUPE_SEC);
      } catch (e) {
        this.logger.warn(`connected-mail dedupe unavailable, sending anyway: ${(e as Error).message}`);
      }
      if (first) surviving.push(a);
    }
    if (surviving.length === 0) return;

    const send = (r: { email: string; language: string }, names: string[]) =>
      void this.mail
        .sendAppConnectedEmail({
          to: r.email,
          lang: r.language,
          appName: p.appName,
          accountNames: names,
          connectedByName: p.grantor.name,
          manageUrl: CONNECTED_APPS_URL,
        })
        .catch(logFireAndForget(this.logger, 'OAuthAuthorizeService.sendAppConnectedEmail'));

    send(p.grantor, surviving.map((a) => a.name));

    const byOwner = new Map<string, { user: { email: string; language: string }; names: string[] }>();
    for (const a of surviving.filter((x) => x.grantorRole === 'editor')) {
      const owners = await this.prisma.accountMember.findMany({
        where: { accountId: a.id, role: 'owner', userId: { not: p.grantorId } },
        include: { user: { select: { email: true, language: true } } },
      });
      for (const o of owners) {
        const entry = byOwner.get(o.userId) ?? { user: o.user, names: [] };
        entry.names.push(a.name);
        byOwner.set(o.userId, entry);
      }
    }
    for (const { user, names } of byOwner.values()) send(user, names);
  }
}

/** Appends params to the registered URI, keeping any query it already has. Values are URL-encoded. */
function buildRedirect(redirectUri: string, params: Record<string, string>, state: string | undefined): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (state !== undefined && state !== '') url.searchParams.set('state', state);
  return url.toString();
}
