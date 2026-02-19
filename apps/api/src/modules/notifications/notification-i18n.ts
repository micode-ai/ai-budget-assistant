type Lang = string;

interface SharedExpenseParams {
  accountName: string;
  creatorName: string;
  currencyCode: string;
  amount: string;
  description: string;
}

interface BudgetThresholdParams {
  budgetName: string;
  threshold: number;
  currencyCode: string;
  spent: string;
  total: string;
}

interface SpendingAnomalyParams {
  categoryName: string;
  percent: number;
}

const translations: Record<string, {
  sharedExpenseTitle: (p: SharedExpenseParams) => string;
  sharedExpenseBody: (p: SharedExpenseParams) => string;
  budgetThresholdTitle: (p: BudgetThresholdParams) => string;
  budgetThresholdBody: (p: BudgetThresholdParams) => string;
  budgetExceededTitle: (p: BudgetThresholdParams) => string;
  budgetExceededBody: (p: BudgetThresholdParams) => string;
  anomalyTitle: (p: SpendingAnomalyParams) => string;
  anomalyBody: (p: SpendingAnomalyParams) => string;
}> = {
  en: {
    sharedExpenseTitle: ({ accountName }) => `New expense in "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} added ${currencyCode} ${amount} for ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" at ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${currencyCode} ${spent} of ${currencyCode} ${total} used.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" exceeded!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `You've spent ${currencyCode} ${spent} of your ${currencyCode} ${total} budget.`,
    anomalyTitle: ({ categoryName }) => `Unusual spending on ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `You've spent ${percent}% more than usual on ${categoryName} this month.`,
  },
  ru: {
    sharedExpenseTitle: ({ accountName }) => `Новый расход в "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} добавил ${amount} ${currencyCode} за ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Бюджет "${budgetName}" использован на ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Потрачено ${spent} ${currencyCode} из ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Бюджет "${budgetName}" превышен!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Потрачено ${spent} ${currencyCode} из запланированных ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Необычные траты: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `В этом месяце вы потратили на ${percent}% больше обычного на ${categoryName}.`,
  },
  ua: {
    sharedExpenseTitle: ({ accountName }) => `Новий витрат у "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} додав ${amount} ${currencyCode} за ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Бюджет "${budgetName}" використано на ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Витрачено ${spent} ${currencyCode} з ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Бюджет "${budgetName}" перевищено!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Витрачено ${spent} ${currencyCode} із запланованих ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Незвичайні витрати: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Цього місяця ви витратили на ${percent}% більше за звичайне на ${categoryName}.`,
  },
  pl: {
    sharedExpenseTitle: ({ accountName }) => `Nowy wydatek w "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} dodał ${amount} ${currencyCode} za ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budżet "${budgetName}" wykorzystany w ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Wydano ${spent} ${currencyCode} z ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Budżet "${budgetName}" przekroczony!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Wydano ${spent} ${currencyCode} z planowanych ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Nietypowe wydatki: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `W tym miesiącu wydałeś ${percent}% więcej niż zwykle na ${categoryName}.`,
  },
  es: {
    sharedExpenseTitle: ({ accountName }) => `Nuevo gasto en "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} agregó ${amount} ${currencyCode} por ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Presupuesto "${budgetName}" al ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Gastado ${spent} ${currencyCode} de ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `¡Presupuesto "${budgetName}" superado!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Has gastado ${spent} ${currencyCode} de tu presupuesto de ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Gasto inusual en ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Has gastado ${percent}% más de lo habitual en ${categoryName} este mes.`,
  },
  fr: {
    sharedExpenseTitle: ({ accountName }) => `Nouvelle dépense dans "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} a ajouté ${amount} ${currencyCode} pour ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" à ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${spent} ${currencyCode} dépensés sur ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" dépassé !`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Vous avez dépensé ${spent} ${currencyCode} sur votre budget de ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Dépense inhabituellement élevée : ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Vous avez dépensé ${percent}% de plus que d'habitude pour ${categoryName} ce mois-ci.`,
  },
  de: {
    sharedExpenseTitle: ({ accountName }) => `Neue Ausgabe in "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} hat ${amount} ${currencyCode} für ${description} hinzugefügt`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Budget "${budgetName}" zu ${threshold}% genutzt`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `${spent} ${currencyCode} von ${total} ${currencyCode} ausgegeben.`,
    budgetExceededTitle: ({ budgetName }) => `Budget "${budgetName}" überschritten!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Du hast ${spent} ${currencyCode} von deinem Budget von ${total} ${currencyCode} ausgegeben.`,
    anomalyTitle: ({ categoryName }) => `Ungewöhnliche Ausgaben: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `Du hast diesen Monat ${percent}% mehr als üblich für ${categoryName} ausgegeben.`,
  },
  be: {
    sharedExpenseTitle: ({ accountName }) => `Новы расход у "${accountName}"`,
    sharedExpenseBody: ({ creatorName, currencyCode, amount, description }) =>
      `${creatorName} дадаў ${amount} ${currencyCode} за ${description}`,
    budgetThresholdTitle: ({ budgetName, threshold }) => `Бюджэт "${budgetName}" выкарыстаны на ${threshold}%`,
    budgetThresholdBody: ({ currencyCode, spent, total }) =>
      `Патрачана ${spent} ${currencyCode} з ${total} ${currencyCode}.`,
    budgetExceededTitle: ({ budgetName }) => `Бюджэт "${budgetName}" перавышаны!`,
    budgetExceededBody: ({ currencyCode, spent, total }) =>
      `Патрачана ${spent} ${currencyCode} з запланаваных ${total} ${currencyCode}.`,
    anomalyTitle: ({ categoryName }) => `Незвычайныя выдаткі: ${categoryName}`,
    anomalyBody: ({ categoryName, percent }) =>
      `У гэтым месяцы вы патрацілі на ${percent}% больш за звычайнае на ${categoryName}.`,
  },
};

function t(lang: Lang) {
  return translations[lang] || translations['en'];
}

export function sharedExpenseTitle(lang: Lang, params: SharedExpenseParams): string {
  return t(lang).sharedExpenseTitle(params);
}

export function sharedExpenseBody(lang: Lang, params: SharedExpenseParams): string {
  return t(lang).sharedExpenseBody(params);
}

export function budgetThresholdTitle(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetThresholdTitle(params);
}

export function budgetThresholdBody(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetThresholdBody(params);
}

export function budgetExceededTitle(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetExceededTitle(params);
}

export function budgetExceededBody(lang: Lang, params: BudgetThresholdParams): string {
  return t(lang).budgetExceededBody(params);
}

export function anomalyTitle(lang: Lang, params: SpendingAnomalyParams): string {
  return t(lang).anomalyTitle(params);
}

export function anomalyBody(lang: Lang, params: SpendingAnomalyParams): string {
  return t(lang).anomalyBody(params);
}
