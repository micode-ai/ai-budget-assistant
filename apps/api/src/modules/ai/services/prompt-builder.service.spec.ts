import { PromptBuilder } from './prompt-builder.service';
import { AI_TOOL_DEFINITIONS } from './ai-tool-schemas';
import type { UserContext } from './user-context-builder.service';

describe('PromptBuilder language detection', () => {
  const pb = new PromptBuilder();

  describe('detectLanguage', () => {
    it('classifies clearly French text (unique chars ç/è/ê/à) as French', () => {
      expect(pb.detectLanguage('Ça va coûter combien à la fin du mois ?')).toBe('French');
    });

    it('classifies clearly Spanish text (¿/ñ/á) as Spanish', () => {
      expect(pb.detectLanguage('¿Cuánto he gastado este mes en la compañía?')).toBe('Spanish');
    });

    it('does NOT classify French words containing only the shared "é" as Spanish', () => {
      // "dépenses", "café", "été" all contain é, which is common to both FR and ES.
      // The shared char must not force a Spanish classification.
      expect(pb.detectLanguage('Quelles sont mes dépenses ce mois-ci ?')).not.toBe('Spanish');
    });

    it('still detects Cyrillic, German and Polish', () => {
      expect(pb.detectLanguage('Сколько я потратил в этом месяце?')).toBe('Russian');
      expect(pb.detectLanguage('Wie viel habe ich für Lebensmittel ausgegeben?')).toBe('German');
      expect(pb.detectLanguage('Ile wydałem w tym miesiącu na zakupy?')).toBe('Polish');
    });

    it('tells Belarusian from Ukrainian — both write "і", only Belarusian has "ў", "ы", "э"', () => {
      expect(pb.detectLanguage('Колькі я патраціў у гэтым месяцы?')).toBe('Belarusian');
      expect(pb.detectLanguage('Дадай выдатак на ежу і хлеб')).toBe('Belarusian');
      expect(pb.detectLanguage('Скільки я витратив цього місяця?')).toBe('Ukrainian');
      expect(pb.detectLanguage('Додай витрату на їжу')).toBe('Ukrainian');
      expect(pb.detectLanguage('Покажи мої витрати')).toBe('Ukrainian');
    });
  });

  describe('detectUserLanguage', () => {
    it('reproduces the bug fix: French UI + ambiguous French message → French, never Spanish', () => {
      const lang = pb.detectUserLanguage('Quelles sont mes dépenses ce mois-ci ?', [], 'fr');
      expect(lang).toBe('French');
    });

    it('honors the UI locale for a plain ASCII message', () => {
      expect(pb.detectUserLanguage('ok', [], 'fr')).toBe('French');
      expect(pb.detectUserLanguage('ok', [], 'es')).toBe('Spanish');
      expect(pb.detectUserLanguage('ok', [], 'de')).toBe('German');
    });

    it('lets the message language override the UI locale when the script is unambiguous', () => {
      // French UI, but the user wrote in Russian → reply in Russian.
      expect(pb.detectUserLanguage('Сколько я потратил?', [], 'fr')).toBe('Russian');
    });

    it('disambiguates the shared "é" via the UI locale, both directions', () => {
      expect(pb.detectUserLanguage('un café', [], 'fr')).toBe('French');
      expect(pb.detectUserLanguage('un café', [], 'es')).toBe('Spanish');
    });

    it('falls back to recent assistant history when no UI locale is provided', () => {
      const history = [{ role: 'assistant', content: 'Voici vos dépenses pour ce mois-ci : ...' }];
      // assistant reply has "à"/"ç"? "Voici vos dépenses" — contains é only, so use a clearly-French reply
      const frHistory = [{ role: 'assistant', content: 'Voilà votre budget. Ça représente une grosse dépense.' }];
      expect(pb.detectUserLanguage('ok', frHistory, undefined)).toBe('French');
      void history;
    });

    it('defaults to English when nothing indicates another language', () => {
      expect(pb.detectUserLanguage('how much did I spend?', [], 'en')).toBe('English');
      expect(pb.detectUserLanguage('how much did I spend?', [], undefined)).toBe('English');
    });
  });

  describe('buildSystemPrompt', () => {
    const ctx = {
      totalSpentThisMonth: 10, monthlyBudget: 0, recentExpenses: [], tags: [], projects: [], topItems: [],
      categoryNames: ['Food'], savingsGoals: [], activeDebts: [],
    } as unknown as UserContext;
    const build = (mode: 'simple' | 'balanced' | 'expert') => pb.buildSystemPrompt(ctx, 0, mode, 'hi', [], null, 'PLN', 'en');

    it('keeps the cacheable prefix identical across response modes; the style block sits after it', () => {
      const [simple, expert] = [build('simple'), build('expert')];
      const cut = simple.indexOf('RESPONSE STYLE');
      expect(cut).toBeGreaterThan(0);
      expect(simple.slice(0, cut)).toBe(expert.slice(0, expert.indexOf('RESPONSE STYLE')));
      expect(simple).not.toBe(expert);
    });

    it('no longer carries per-tool routing prose (it lives in the tool descriptions)', () => {
      const prompt = build('balanced');
      const staticPart = prompt.slice(0, prompt.indexOf('--- DYNAMIC CONTEXT ---'));
      for (const name of ['record_debt_repayment', 'create_debt', 'update_goal_balance', 'check_affordability', 'add_to_shopping_list', 'remove_from_shopping_list', 'get_inflation_shield', 'get_shopping_suggestions', 'get_deposit_total', 'get_discount_total', 'get_expenses', 'descriptionKeyword']) {
        expect(staticPart).not.toContain(name);
      }
    });

    it('steers a user with no transactions to logging the first expense from chat (ABA-736)', () => {
      const prompt = pb.buildSystemPrompt({ ...ctx, hasAnyTransactions: false }, 0, 'balanced', 'hi', [], null, 'PLN', 'en');
      expect(prompt).toContain('NEW USER');
      expect(prompt).toContain('create_expense');
      expect(prompt).toContain('never invent figures');
      // It belongs to the per-user suffix: the two prompts share the whole static prefix
      // and first differ after it, so the cacheable part is untouched.
      const plain = build('balanced');
      let i = 0;
      while (i < plain.length && plain[i] === prompt[i]) i++;
      expect(plain.slice(0, i)).toContain('do not guess.');
    });

    it('adds no new-user nudge when the user has data, or when the flag is absent (an older cached context)', () => {
      expect(pb.buildSystemPrompt({ ...ctx, hasAnyTransactions: true }, 0, 'balanced', 'hi', [], null, 'PLN', 'en')).not.toContain('NEW USER');
      expect(build('balanced')).not.toContain('NEW USER');
    });

    it('moved the multilingual deposit/discount vocabulary and reporting rules into the tool descriptions', () => {
      const desc = (n: string) => AI_TOOL_DEFINITIONS.find((t) => t.type === 'function' && t.function.name === n)!.function.description!;
      expect(desc('get_deposit_total')).toContain('kaucja');
      expect(desc('get_deposit_total')).toContain('ALREADY PAID');
      expect(desc('get_discount_total')).toContain('korting');
      expect(desc('check_affordability')).toContain('verbatim');
      expect(desc('get_expenses')).toContain('matchedExpenses');
    });
  });

  describe('buildActionSummary', () => {
    const pb2 = new PromptBuilder();
    const langs = ['English', 'Russian', 'Ukrainian', 'Belarusian', 'German', 'Spanish', 'French', 'Polish', 'Dutch'];

    it('describes create_category in every language', () => {
      const out = langs.map((l) => pb2.buildActionSummary('create_category', { name: 'Pets', type: 'expense' }, l));
      out.forEach((o) => { expect(o).toContain('"Pets"'); expect(o).not.toContain('undefined'); });
      expect(new Set(out).size).toBe(langs.length);
    });

    it('never prints undefined for repayment / goal args that lack currency, contact or goal name', () => {
      for (const l of langs) {
        const repay = pb2.buildActionSummary('record_debt_repayment', { debtId: 'd1', amount: 50 }, l);
        const goal = pb2.buildActionSummary('update_goal_balance', { goalId: 'g1', newAmount: 900 }, l);
        expect(repay).toContain('50');
        expect(goal).toContain('900');
        expect(repay + goal).not.toMatch(/undefined|null/);
      }
    });

    it('uses ua/be wording, not Russian', () => {
      expect(pb2.buildActionSummary('create_expense', { amount: 5, currencyCode: 'PLN' }, 'Ukrainian')).toContain('витрата');
      expect(pb2.buildActionSummary('create_expense', { amount: 5, currencyCode: 'PLN' }, 'Belarusian')).toContain('выдатак');
    });

    it('keeps the English create_expense phrasing', () => {
      expect(pb2.buildActionSummary('create_expense', { amount: 5, currencyCode: 'PLN', description: 'tea', categoryName: 'Food' })).toBe('expense 5 PLN for "tea" [Food]');
    });
  });

  describe('getConfirmPromptText', () => {
    it('embeds the summary in all 9 languages, each distinct', () => {
      const langs = ['English', 'Russian', 'Ukrainian', 'Belarusian', 'German', 'Spanish', 'French', 'Polish', 'Dutch'];
      const out = langs.map((l) => pb.getConfirmPromptText(l, 'SUMMARY'));
      out.forEach((o) => expect(o).toContain('SUMMARY'));
      expect(new Set(out).size).toBe(9);
      expect(out[0]).toBe("I'd like to SUMMARY. Please confirm or cancel.");
    });
  });

  describe('Portuguese (pt / br)', () => {
    it('detects Portuguese by ã/õ and by a common-word list, before the French/Spanish block', () => {
      expect(pb.detectLanguage('Gastei 20 euros no café hoje')).toBe('Portuguese');
      expect(pb.detectLanguage('Comprei pão e feijão')).toBe('Portuguese');
      expect(pb.detectLanguage('Quanto gastei este mês? Você sabe?')).toBe('Portuguese');
      // "gastos" is ordinary Portuguese, so it must not count as a Spanish-only word.
      expect(pb.detectLanguage('Quanto foram os meus gastos esta semana?')).not.toBe('Spanish');
    });

    it('does not steal clear French or Spanish messages', () => {
      expect(pb.detectLanguage("J'ai payé 5 euros au café")).toBe('French');
      expect(pb.detectLanguage('Gasté 20 euros en el café')).toBe('Spanish');
      expect(pb.detectLanguage('Gasté 20 euros en el mercado mañana')).toBe('Spanish');
      expect(pb.detectLanguage('Gasté 20 euros en el mercado')).not.toBe('Portuguese');
      expect(pb.detectLanguage('Ça va coûter combien à la fin du mois ?')).toBe('French');
    });

    it('maps the pt and br UI locales to their variant names', () => {
      expect(pb.localeToLanguageName('pt')).toBe('European Portuguese');
      expect(pb.localeToLanguageName('br')).toBe('Brazilian Portuguese');
    });

    it('resolves full external tags with the app locale rule', () => {
      expect(pb.localeToLanguageName('pt-BR')).toBe('Brazilian Portuguese');
      expect(pb.localeToLanguageName('pt_br')).toBe('Brazilian Portuguese');
      expect(pb.localeToLanguageName('pt-PT')).toBe('European Portuguese');
      expect(pb.localeToLanguageName('uk-UA')).toBe('Ukrainian');
      expect(pb.localeToLanguageName('fr-CA')).toBe('French');
      expect(pb.localeToLanguageName('ja')).toBeNull();
    });

    it('answers a detected Portuguese message in the UI variant, Brazilian otherwise', () => {
      expect(pb.detectUserLanguage('Comprei pão', [], 'pt')).toBe('European Portuguese');
      expect(pb.detectUserLanguage('Comprei pão', [], 'br')).toBe('Brazilian Portuguese');
      expect(pb.detectUserLanguage('Comprei pão', [], 'en')).toBe('Brazilian Portuguese');
      expect(pb.detectUserLanguage('Comprei pão', [], undefined)).toBe('Brazilian Portuguese');
      expect(pb.detectUserLanguage('ok', [], 'pt')).toBe('European Portuguese');
      expect(pb.detectUserLanguage('ok', [], 'br')).toBe('Brazilian Portuguese');
    });

    it('resolves a Portuguese assistant history to a variant, never the bare name', () => {
      const history = [{ role: 'assistant', content: 'Não encontrei despesas hoje.' }];
      expect(pb.detectUserLanguage('ok', history, undefined)).toBe('Brazilian Portuguese');
    });

    describe('every fixed-string helper answers both variants in Portuguese', () => {
      const variants = ['European Portuguese', 'Brazilian Portuguese'];
      const english = 'English';
      const helpers: Array<[string, (l: string) => string]> = [
        ['buildActionSummary', (l) => pb.buildActionSummary('create_category', { name: 'Pets', type: 'expense' }, l)],
        ['buildActionSummary (undo_last_action)', (l) => pb.buildActionSummary('undo_last_action', { originalActionType: 'create_expense', originalResultData: { amount: 5, currencyCode: 'EUR' } }, l)],
        ['getConfirmPromptText', (l) => pb.getConfirmPromptText(l, 'S')],
        ['getConfirmText', (l) => pb.getConfirmText(l, 'S')],
        ['getFailText', (l) => pb.getFailText(l, 'E')],
        ['getShoppingListAddText', (l) => pb.getShoppingListAddText(l, 'L', ['milk'])],
        ['getShoppingListRemoveText (removed)', (l) => pb.getShoppingListRemoveText(l, ['milk'], [])],
        ['getShoppingListRemoveText (nothing)', (l) => pb.getShoppingListRemoveText(l, [], [])],
        ['getShoppingListRemoveText (not found)', (l) => pb.getShoppingListRemoveText(l, ['milk'], ['eggs'])],
        ['getRejectText', (l) => pb.getRejectText(l)],
        ['getUndoConfirmText', (l) => pb.getUndoConfirmText(l, { undoneEntityType: 'expense', amount: 5, currencyCode: 'EUR' })],
        ['getUndoUnavailableText (stale)', (l) => pb.getUndoUnavailableText(l, 'stale')],
        ['getUndoUnavailableText (nothing)', (l) => pb.getUndoUnavailableText(l, 'nothing')],
      ];
      it.each(helpers)('%s', (_name, fn) => {
        for (const v of variants) expect(fn(v)).not.toBe(fn(english));
        // A bare 'Portuguese' (should one ever reach a helper) reads as Brazilian.
        expect(fn('Portuguese')).toBe(fn('Brazilian Portuguese'));
      });
    });

    it('prefixes an undo summary in Portuguese, not English', () => {
      const args = { originalActionType: 'create_expense', originalResultData: { amount: 5, currencyCode: 'EUR' } };
      expect(pb.buildActionSummary('undo_last_action', args, 'European Portuguese')).toBe('anular a última ação: despesa 5 EUR');
      expect(pb.buildActionSummary('undo_last_action', args, 'Brazilian Portuguese')).toBe('desfazer a última ação: despesa 5 EUR');
      expect(pb.buildActionSummary('undo_last_action', args, 'Portuguese')).toBe('desfazer a última ação: despesa 5 EUR');
    });

    it('addresses the European variant without "você"', () => {
      const pt = [
        pb.getConfirmPromptText('European Portuguese', 'S'), pb.getRejectText('European Portuguese'),
        pb.getUndoUnavailableText('European Portuguese', 'stale'), pb.getUndoUnavailableText('European Portuguese', 'nothing'),
      ].join(' ');
      expect(pt).not.toMatch(/você/i);
    });
  });
});
