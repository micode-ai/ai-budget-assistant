import { renderGroupNotFoundPage } from './helpers/group-guest-page';
import { getGroupGuestStrings } from './helpers/group-guest-page-i18n';

describe('group guest page <html lang>', () => {
  it('emits pt-BR for br so it is never read as Breton', () => {
    expect(renderGroupNotFoundPage(getGroupGuestStrings('br'))).toContain('<html lang="pt-BR">');
  });
});
