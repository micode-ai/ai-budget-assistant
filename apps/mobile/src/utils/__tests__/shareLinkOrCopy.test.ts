import { shareLinkOrCopy } from '../shareLinkOrCopy';

const URL_ = 'https://api.example/sl/tok';

describe('shareLinkOrCopy', () => {
  it('shares through the system sheet when it is available', async () => {
    const copy = jest.fn();
    const r = await shareLinkOrCopy(URL_, { share: jest.fn().mockResolvedValue({ action: 'sharedAction' }), copy });
    expect(r).toBe('shared');
    expect(copy).not.toHaveBeenCalled();
  });

  it('treats closing the sheet as dismissed, not as a failure', async () => {
    const copy = jest.fn();
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(await shareLinkOrCopy(URL_, { share: jest.fn().mockRejectedValue(aborted), copy })).toBe('dismissed');
    expect(await shareLinkOrCopy(URL_, { share: jest.fn().mockResolvedValue({ action: 'dismissedAction' }), copy })).toBe('dismissed');
    expect(copy).not.toHaveBeenCalled();
  });

  it('copies the link when the browser refuses the share sheet', async () => {
    const copy = jest.fn().mockResolvedValue(true);
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const r = await shareLinkOrCopy(URL_, { share: jest.fn().mockRejectedValue(denied), copy });
    expect(r).toBe('copied');
    expect(copy).toHaveBeenCalledWith(URL_);
  });

  it('reports manual when neither sharing nor copying works', async () => {
    const r = await shareLinkOrCopy(URL_, {
      share: jest.fn().mockRejectedValue(new Error('not supported')),
      copy: jest.fn().mockRejectedValue(new Error('clipboard blocked')),
    });
    expect(r).toBe('manual');
  });
});
