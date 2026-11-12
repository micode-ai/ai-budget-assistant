import { isIPv4, isIPv6 } from 'net';

/**
 * The rate-limit bucket of a client address. IPv4 is the address itself. IPv6 is its /64 prefix:
 * a single host or customer is routinely handed a whole /64, so keying on the full address would
 * let one client rotate through 2^64 buckets. An IPv4-mapped IPv6 address (`::ffff:1.2.3.4`, what a
 * dual-stack listener reports for an IPv4 peer) counts as the IPv4 address. Anything unparseable is
 * kept as-is (lower-cased), so it still lands in a bucket of its own.
 */
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/%.*$/, ''); // drop an IPv6 zone id
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return ip;
  const groups = expandIPv6(ip);
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** Eight 16-bit groups of a valid IPv6 address (handles `::` and an embedded dotted-quad tail). */
function expandIPv6(ip: string): number[] {
  let s = ip;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const [a, b, c, d] = tail[1].split('.').map(Number);
    s = `${s.slice(0, -tail[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = s.split('::');
  const h = head ? head.split(':') : [];
  const r = rest !== undefined && rest !== '' ? rest.split(':') : [];
  const missing = s.includes('::') ? 8 - h.length - r.length : 0;
  return [...h, ...Array(missing).fill('0'), ...r].map((g) => parseInt(g, 16));
}
