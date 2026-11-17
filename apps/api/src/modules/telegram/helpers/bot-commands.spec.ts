import { commandMenu, registerCommandMenu } from './bot-commands';

describe('Telegram command menu (ABA-812)', () => {
  it('puts /account first and falls back to English', () => {
    expect(commandMenu('ru')[0].command).toBe('account');
    expect(commandMenu('xx')).toEqual(commandMenu('default'));
  });

  it('registers a default menu and one per language', async () => {
    const setMyCommands = jest.fn().mockResolvedValue(true);
    await registerCommandMenu({ setMyCommands } as any);
    expect(setMyCommands).toHaveBeenCalledWith(expect.any(Array), undefined);
    expect(setMyCommands).toHaveBeenCalledWith(expect.any(Array), { language_code: 'uk' });
  });
});
