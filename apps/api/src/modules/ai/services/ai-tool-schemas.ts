import OpenAI from 'openai';

/**
 * The 18 OpenAI function-calling tool schemas exposed to the chat model. Data-only —
 * no logic. Extracted from AiToolsService.getToolDefinitions() (tech-debt
 * ai-tools-service-god-file) so the schema block doesn't dominate the dispatcher file.
 */
export const AI_TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_expense',
      description: 'Create a new expense/spending entry. Use when the user asks to add, log, or record an expense.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'The expense amount' },
          currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'], description: 'Currency code. Infer from symbols: ₴=UAH, $=USD, €=EUR, zł=PLN, £=GBP, ₽=RUB' },
          description: { type: 'string', description: 'What the expense was for' },
          categoryName: { type: 'string', description: 'Category name (e.g., "Food & Drinks", "Entertainment", "Transport")' },
          date: { type: 'string', description: 'ISO date string (YYYY-MM-DD). Default to today if not specified.' },
        },
        required: ['amount', 'currencyCode', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_income',
      description: 'Create a new income entry. Use when the user asks to add or record income.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'The income amount' },
          currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'] },
          description: { type: 'string', description: 'Income source description' },
          categoryName: { type: 'string', description: 'Category name' },
          date: { type: 'string', description: 'ISO date string (YYYY-MM-DD)' },
        },
        required: ['amount', 'currencyCode', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_budget',
      description: 'Create a new budget. Use when the user asks to set up or create a budget for a category or period.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Budget name' },
          amount: { type: 'number', description: 'Budget limit amount' },
          currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'] },
          period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'], description: 'Budget period' },
          categoryName: { type: 'string', description: 'Category to budget for' },
          startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD), for custom period' },
        },
        required: ['name', 'amount', 'currencyCode', 'period', 'startDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new expense or income category. Use when the user asks to add, create, or make a new category.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Category name (e.g., "Food", "Freelance", "Transport")' },
          type: { type: 'string', enum: ['expense', 'income'], description: 'Whether this is an expense or income category' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_expenses',
      description: 'Retrieve and display user expenses for a date range. Use when user asks to show, list, or view their spending.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD). OMIT this for product/item/merchant questions ("how much did I spend on beer") unless the user names an explicit time period — the tool then searches the full history so older purchases are not missed.' },
          endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD). OMIT together with startDate for un-scoped product/item questions; defaults to today.' },
          categoryName: { type: 'string', description: 'Filter by category name. ONLY set this when the user explicitly names a category to filter by. Never derive it from a speaker-name prefix like "[Name]:" in a shared conversation.' },
          descriptionKeyword: { type: 'string', description: 'The product/merchant/item the user asks about, copied from their message in whatever language and spelling they used (e.g. "beer", "пиво", "пивка", "cerveza", a typo like "cofee"). The server performs a semantic, language- and typo-tolerant match across all expenses AND receipt line items in the range — not a plain substring — so it finds brand names, misspellings and cross-language equivalents. Do NOT translate or "correct" the term yourself; pass what the user wrote. Can be combined with categoryName.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_status',
      description: 'Get the current status and progress of budgets. Use when user asks about budget status, how much is left, or if they are on track.',
      parameters: {
        type: 'object',
        properties: {
          budgetName: { type: 'string', description: 'Specific budget name to check' },
          categoryName: { type: 'string', description: 'Category-linked budget to check' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_category_breakdown',
      description: 'Get spending breakdown by category for a period. Use when user asks for category analysis, breakdown, or pie chart data.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD)' },
        },
        required: ['startDate', 'endDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_debt_summary',
      description: 'Get a summary of all active debts — money lent to others and money borrowed. Use when the user asks about debts, who owes them money, or how much they owe.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_debt_repayment',
      description: 'Record a (partial or full) repayment for an existing debt. Use when user says someone repaid them, or they repaid someone. IMPORTANT: use the debt id from the activeDebts context, not the contact name directly. If multiple debts match the same contact name, ask the user to clarify which one.',
      parameters: {
        type: 'object',
        properties: {
          debtId: { type: 'string', description: 'The id of the debt being repaid (from activeDebts context)' },
          amount: { type: 'number', description: 'Repayment amount' },
          date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Default to today if not specified.' },
        },
        required: ['debtId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_debt',
      description: 'Create a new debt entry — either money lent to someone or money borrowed from someone. Use when user says they lent money to someone or borrowed from someone.',
      parameters: {
        type: 'object',
        properties: {
          contactName: { type: 'string', description: 'Name of the person lent to or borrowed from' },
          amount: { type: 'number', description: 'Debt amount' },
          currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'], description: 'Currency code' },
          direction: { type: 'string', enum: ['lent', 'borrowed'], description: '"lent" = I gave money to someone; "borrowed" = I received money from someone' },
          dueDate: { type: 'string', description: 'Optional due date ISO string (YYYY-MM-DD)' },
        },
        required: ['contactName', 'amount', 'currencyCode', 'direction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_goal_balance',
      description: 'Update the current saved amount for a savings goal. Use when user says they added money to a goal, saved some amount towards a goal, or want to set the current balance of a goal. Use the goalId from the savingsGoals context.',
      parameters: {
        type: 'object',
        properties: {
          goalId: { type: 'string', description: 'The id of the savings goal (from savingsGoals context)' },
          newAmount: { type: 'number', description: 'The new current amount saved towards the goal' },
        },
        required: ['goalId', 'newAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_affordability',
      description: 'Answer "can I afford X" questions. Computes a deterministic YES/NO from the cashflow engine. Use whenever the user asks if they can afford/buy something for an amount.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'The price the user wants to spend' },
          currencyCode: { type: 'string', enum: ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'], description: 'Currency code. Infer from symbols: ₴=UAH, $=USD, €=EUR, zł=PLN, £=GBP, ₽=RUB' },
          description: { type: 'string', description: 'What they want to buy (optional)' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_shopping_list',
      description: 'Add one or more items to the user\'s shopping / grocery list. Use when the user asks to put something on their shopping list, add groceries to buy, or remember to buy something (e.g. "add milk and bread to my shopping list", "put eggs on the list", "добавь молоко и хлеб в список покупок"). This is NOT for recording money spent — that is create_expense.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'The product/item names to add, e.g. ["milk", "bread", "eggs"]. Copy each name from the user\'s message in their own language and spelling — do NOT translate or correct them.',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inflation_shield',
      description: 'Get the user\'s Inflation Shield: which of their regularly-bought products are rising in price and what to stock up on NOW to save money, plus how much the shield has saved them so far. Use when the user asks what to buy ahead / stock up on, what is getting more expensive, or how much they have saved by buying ahead. Read-only, no parameters.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_shopping_list',
      description: 'Remove one or more items from the user\'s shopping / grocery list, e.g. because they already bought it or added it by mistake. Use for "remove milk from my list", "take eggs off the shopping list", "убери молоко из списка покупок". Only removes items not yet checked off.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'The product/item names to remove, e.g. ["milk", "bread"]. Copy each name from the user\'s message in their own language and spelling — do NOT translate or correct them.',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_shopping_suggestions',
      description: 'Get what the user is running low on and due to restock, plus any current price deals on their regular purchases. Use for "what am I running low on", "what should I buy", "any deals right now". Read-only, no parameters.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_deposit_total',
      description:
        'Get how much the user has paid in deposits on returnable packaging (bottles, cans, crates) — the charge printed separately on a receipt and refunded when the packaging is returned. Use for ANY question about this charge in any language: "kaucja" (PL), "Pfand" (DE), "statiegeld" (NL), "consigne" (FR), "depósito"/"envases" (ES), "залог за тару"/"кауция"/"за бутылки" (RU), "застава за тару" (UA), "закладзь за тару" (BE), "bottle deposit"/"can deposit" (EN). Returns the total, the number of receipts, the top stores and the most recent receipts. Read-only. Both dates are OPTIONAL — omit them unless the user named a period, and the whole history is searched.',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Start of the period, YYYY-MM-DD. Omit unless the user named a period.',
          },
          endDate: {
            type: 'string',
            description: 'End of the period, YYYY-MM-DD. Omit unless the user named a period.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_discount_total',
      description:
        'Get how much the user has been given in discounts on their purchases — money already taken off a receipt\'s basket, from per-item markdowns or a store coupon. Use for ANY question about this in any language: "rabat"/"zniżka"/"opust" (PL), "Rabatt" (DE), "korting" (NL), "réduction"/"remise" (FR), "descuento" (ES), "скидка" (RU), "знижка" (UA), "зніжка" (BE), "discount" (EN). Returns the total, the number of receipts, the top stores and the most recent receipts. Read-only. Both dates are OPTIONAL — omit them unless the user named a period, and the whole history is searched.',
      parameters: {
        type: 'object',
        properties: {
          startDate: {
            type: 'string',
            description: 'Start of the period, YYYY-MM-DD. Omit unless the user named a period.',
          },
          endDate: {
            type: 'string',
            description: 'End of the period, YYYY-MM-DD. Omit unless the user named a period.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'undo_last_action',
      description:
        'Revert the single most recent write action in THIS conversation — a just-created expense, income, or debt, a debt repayment, or a savings-goal balance update. Use when the user says "undo", "undo that", "undo it", "cancel that", "delete the last one", "that\'s wrong, remove it", "I made a mistake, take it back" — in ANY language. No parameters: the server automatically finds and resolves the action to revert. Does NOT undo budgets, categories, or anything more than one step back — only the most recent write is ever undoable.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

/**
 * Which action types require user confirmation before executing (see
 * AiToolsService.isWriteAction). 'check_affordability' is intentionally NOT in this
 * list — it is a READ action (no confirmation required, executes immediately via
 * executeWithCache).
 */
export const AI_WRITE_ACTION_TYPES = [
  'create_expense',
  'create_income',
  'create_budget',
  'create_category',
  'record_debt_repayment',
  'create_debt',
  'update_goal_balance',
  'undo_last_action',
] as const;
