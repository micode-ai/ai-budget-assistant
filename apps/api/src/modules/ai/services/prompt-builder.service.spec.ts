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
});
