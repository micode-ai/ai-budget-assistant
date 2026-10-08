import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { BlockList, isIP } from 'net';
import { INBOUND_SECRET_MIN_LENGTH, isInboundMailEnabled } from '../inbound-mail.config';

export const INBOUND_SECRET_HEADER = 'x-inbound-secret';

/** RFC1918 private ranges: the default for INBOUND_MAIL_INTERNAL_CIDR. */
export const DEFAULT_INTERNAL_CIDRS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

/** Builds the allow-list from a comma-separated CIDR string; invalid entries are skipped (and reported). */
export function buildInternalBlockList(raw: string | undefined): { list: BlockList; invalid: string[] } {
  const entries = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cidrs = entries.length > 0 ? entries : DEFAULT_INTERNAL_CIDRS;
  const list = new BlockList();
  const invalid: string[] = [];
  let added = 0;
  for (const cidr of cidrs) {
    const [addr, prefixRaw] = cidr.split('/');
    const family = isIP(addr);
    const prefix = Number(prefixRaw);
    const max = family === 4 ? 32 : 128;
    if (!family || prefixRaw === undefined || !Number.isInteger(prefix) || prefix < 0 || prefix > max) {
      invalid.push(cidr);
      continue;
    }
    list.addSubnet(addr, prefix, family === 4 ? 'ipv4' : 'ipv6');
    added++;
  }
  if (added === 0) {
    // Every configured entry was garbage: fall back to the safe default rather than allow nothing by accident.
    for (const cidr of DEFAULT_INTERNAL_CIDRS) {
      const [addr, prefix] = cidr.split('/');
      list.addSubnet(addr, Number(prefix), 'ipv4');
    }
  }
  return { list, invalid };
}

/**
 * Authenticates the SMTP container (ABA-644). Independent checks:
 *  1. no X-Forwarded-For / X-Real-IP (nginx always adds them to proxied requests);
 *  2. the TCP peer address (`req.socket.remoteAddress`, never a header) must be inside
 *     INBOUND_MAIL_INTERNAL_CIDR (default RFC1918);
 *  3. the shared secret, constant-time; it must be >= 32 chars, else every request is refused.
 *
 * The guard sits on the controller class, so every route and every path casing
 * (Express routing is case-insensitive) that reaches a handler passes through it.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger(InternalSecretGuard.name);
  private readonly allowed: BlockList;
  private readonly invalidCidrs: string[];

  constructor(private readonly config: ConfigService) {
    const built = buildInternalBlockList(this.config.get<string>('INBOUND_MAIL_INTERNAL_CIDR'));
    this.allowed = built.list;
    this.invalidCidrs = built.invalid;
  }

  onModuleInit(): void {
    const secret = this.secret();
    if (secret.length < INBOUND_SECRET_MIN_LENGTH && (secret.length > 0 || isInboundMailEnabled(this.config))) {
      this.logger.warn(
        `INBOUND_MAIL_SHARED_SECRET is unset or shorter than ${INBOUND_SECRET_MIN_LENGTH} characters: every internal inbound-mail request will be refused (401)`,
      );
    }
    if (this.invalidCidrs.length > 0) {
      this.logger.warn(`Ignoring invalid INBOUND_MAIL_INTERNAL_CIDR entries: ${this.invalidCidrs.join(', ')}`);
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    }>();

    if (req.headers['x-forwarded-for'] !== undefined || req.headers['x-real-ip'] !== undefined) {
      throw new ForbiddenException();
    }

    if (!this.peerAllowed(req.socket?.remoteAddress)) {
      throw new ForbiddenException();
    }

    const expected = this.secret();
    const provided = req.headers[INBOUND_SECRET_HEADER];
    if (expected.length < INBOUND_SECRET_MIN_LENGTH || typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException();
    }

    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    // timingSafeEqual throws on a length mismatch; a length difference is already a rejection.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
    return true;
  }

  private secret(): string {
    return `${this.config.get<string>('INBOUND_MAIL_SHARED_SECRET') ?? ''}`;
  }

  private peerAllowed(remote: string | undefined): boolean {
    if (!remote) return false;
    const addr = remote.startsWith('::ffff:') ? remote.slice(7) : remote;
    const family = isIP(addr);
    if (!family) return false;
    return this.allowed.check(addr, family === 4 ? 'ipv4' : 'ipv6');
  }
}
