import { DigestChannelRegistry, DigestSender } from './digest-channel.registry';

function fakeSender(channel: DigestSender['channel']): DigestSender {
  return {
    channel,
    send: jest.fn(),
    isLinked: jest.fn(),
    accountIdFor: jest.fn(),
  };
}

describe('DigestChannelRegistry', () => {
  it('registers and retrieves a sender by channel', () => {
    const registry = new DigestChannelRegistry();
    const telegram = fakeSender('telegram');

    registry.register(telegram);

    expect(registry.get('telegram')).toBe(telegram);
    expect(registry.get('whatsapp')).toBeUndefined();
  });

  it('re-registering the same channel replaces the previous sender', () => {
    const registry = new DigestChannelRegistry();
    const first = fakeSender('slack');
    const second = fakeSender('slack');

    registry.register(first);
    registry.register(second);

    expect(registry.get('slack')).toBe(second);
  });

  it('channels() lists every registered channel', () => {
    const registry = new DigestChannelRegistry();
    registry.register(fakeSender('telegram'));
    registry.register(fakeSender('whatsapp'));
    registry.register(fakeSender('slack'));

    expect(registry.channels().sort()).toEqual(['slack', 'telegram', 'whatsapp']);
  });
});
