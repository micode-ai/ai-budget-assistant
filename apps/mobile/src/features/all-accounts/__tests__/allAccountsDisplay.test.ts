import { accountColor, changeRatio } from '../allAccountsDisplay';
import { lightColors } from '@/theme/colors';

describe('allAccountsDisplay', () => {
  it('changeRatio handles null/zero/negative previous', () => {
    expect(changeRatio(5, null)).toBeNull();
    expect(changeRatio(5, 0)).toBeNull();
    expect(changeRatio(0, 100)).toBe(-1);
  });
  it('accountColor cycles and never returns undefined', () => {
    expect(accountColor(0, lightColors)).toBe(lightColors.primary);
    expect(accountColor(5, lightColors)).toBe(lightColors.primary);
    expect(accountColor(-1, lightColors)).toBeTruthy();
  });
});
