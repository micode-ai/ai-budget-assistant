import { ipBucket } from './ip-bucket.util';

describe('ipBucket', () => {
  it('keeps an IPv4 address as is', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket(' 203.0.113.7 ')).toBe('203.0.113.7');
  });

  it('groups every IPv6 address of one /64 into one bucket', () => {
    const a = ipBucket('2001:db8:1234:5678::1');
    const b = ipBucket('2001:0db8:1234:5678:ffff:eeee:dddd:cccc');
    const c = ipBucket('2001:DB8:1234:5678:0:0:0:abcd');
    expect(a).toBe('2001:db8:1234:5678::/64');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('separates different /64s', () => {
    expect(ipBucket('2001:db8:1234:5679::1')).not.toBe(ipBucket('2001:db8:1234:5678::1'));
  });

  it('handles :: at the start, a zone id and loopback', () => {
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('treats an IPv4-mapped IPv6 address as its IPv4 address', () => {
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::ffff:cb00:7107')).toBe('203.0.113.7');
  });

  it('keeps an unparseable value as its own bucket', () => {
    expect(ipBucket('unknown')).toBe('unknown');
  });
});
