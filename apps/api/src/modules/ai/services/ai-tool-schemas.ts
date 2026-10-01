import OpenAI from 'openai';

const CURRENCY_CODES = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];
const CURRENCY_SYMBOL_HINT = 'Infer from symbols: ₴=UAH, $=USD, €=EUR, zł=PLN, £=GBP, ₽=RUB, Br=BYN.';

/**
 * The OpenAI function-calling tool schemas exposed to the chat model. Data-only —
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
          currencyCode: { type: 'string', enum: CURRENCY_CODES, description: `Currency code of the amount. ${CURRENCY_SYMBOL_HINT}` },
          description: { type: 'string', description: 'What the expense was for' },
          categoryName: { type: 'string', description: 'Category name (e.g., "Food & Drinks", "Entertainment", "Transport")' },
          date: { type: 'string', description: 'ISO date string (YYYY-MM-DD). Omit for today — the expense is recorded with today\'s date when no date is given.' },
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
          currencyCode: { type: 'string', enum: CURRENCY_CODES, description: `Currency code of the amount. ${CURRENCY_SYMBOL_HINT}` },
          description: { type: 'string', description: 'Income source description' },
          categoryName: { type: 'string', description: 'Income category name, matched against the available categories' },
          date: { type: 'string', description: 'ISO date string (YYYY-MM-DD). Omit for today — the income is recorded with today\'s date when no date is given.' },
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
          currencyCode: { type: 'string', enum: CURRENCY_CODES, description: `Currency code of the budget limit. ${CURRENCY_SYMBOL_HINT}` },
          period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'], description: 'Budget period' },
          categoryName: { type: 'string', description: 'Exact name of an existing category from the available-categories list; the budget then counts only that category. Omit for an overall budget. An unknown name fails the action.' },
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
      description: 'Retrieve and display user expenses for a date range. Use when user asks to show, list, or view their spending, and for ANY question about how much was spent on a product, merchant or item ("how much have I spent on beer", "сколько я потратил на пиво", "Biedronka", "Netflix"). NEVER answer expense amounts, totals or lists from the context summary — always call this tool. Defaults: with no dates and no descriptionKeyword it returns the CURRENT MONTH (first of the month to today); with a descriptionKeyword and no startDate it searches the FULL history; endDate defaults to today. At most the 500 newest expenses in the range are read per call, and a keyword search considers at most the 1500 newest expenses/receipt line items. Amounts are converted into the user\'s display currency (`baseCurrency`) at approximate rates when `fxConverted` is true — mention the conversion is approximate; each converted row keeps `originalAmount`/`originalCurrencyCode`. `recentExpenses` holds only the 20 newest rows; `totalsByCurrency`, `categoryTotals` and `count` cover the whole filtered set — state totals from `totalsByCurrency`. When `matchedExpenses` is returned (keyword search), use ONLY those entries (not `recentExpenses`) to list items: they are the individual matching purchases/line items, already filtered to the keyword, and the totals are computed from that matched set. If `matchedExpenses` is empty, tell the user no matching expenses were found for that keyword.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Start date ISO string (YYYY-MM-DD). OMIT this for product/item/merchant questions ("how much did I spend on beer") unless the user names an explicit time period — the tool then searches the full history so older purchases are not missed ("how much on beer this month" → pass startDate = first day of this month). Without a keyword and without a date it defaults to the first day of the current month.' },
          endDate: { type: 'string', description: 'End date ISO string (YYYY-MM-DD). OMIT together with startDate for un-scoped product/item questions; defaults to today.' },
          categoryName: { type: 'string', description: 'Filter by category name. ONLY set this when the user explicitly names a category to filter by. Never derive it from a speaker-name prefix like "[Name]:" in a shared conversation.' },
          descriptionKeyword: { type: 'string', description: 'The product/merchant/item the user asks about, copied from their message in whatever language and spelling they used (e.g. "beer", "пиво", "пивка", "cerveza", a typo like "cofee"). The server performs a semantic, language- and typo-tolerant match across all expenses AND receipt line items in the range — not a plain substring — so it finds brand names, misspellings and cross-language equivalents. Do NOT translate or "correct" the term yourself; pass what the user wrote. Pass it whenever the user asks about a specific product, merchant or item (e.g. descriptionKeyword: "пиво" for "сколько я потратил на пиво", with NO dates). Can be combined with categoryName.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_status',
      description: 'Get the current status and progress of budgets. Use when user asks about budget status, how much is left, or if they are on track — ALWAYS call it for budget questions, the budget line in the context summary is only a rough total. It returns `spent`, `remaining`, `overBy` and `percentageUsed` precomputed: do not subtract `spent − amount` yourself, use `overBy` verbatim when a budget is over.',
      parameters: {
        type: 'object',
        properties: {
          budgetName: { type: 'string', description: 'Specific budget name to check' },
          categoryName: { type: 'string', description: 'Return only budgets allocated to a category whose name contains this text (case-insensitive). Each returned budget lists its allocated `categories`; an empty list means an overall budget.' },
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
      description: 'Get every debt — money lent to others and money borrowed — each with its status and remaining balance, plus totals; `activeCount` counts the unpaid ones. Use when the user asks about debts, who owes them money, or how much they owe.',
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
      description: 'Record a (partial or full) repayment for an existing debt. Use when user says someone repaid them, or they repaid someone. IMPORTANT: use the debt id from the activeDebts context, not the contact name directly. If multiple debts share the same contact name, ask a single clarifying question before calling this tool.',
      parameters: {
        type: 'object',
        properties: {
          debtId: { type: 'string', description: 'The id of the debt being repaid (from activeDebts context)' },
          amount: { type: 'number', description: 'Repayment amount' },
          date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Omit for today — the repayment is dated today when no date is given.' },
        },
        required: ['debtId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_debt',
      description: 'Create a new debt entry — either money lent to someone or money borrowed from someone. Use when user says they lent money to someone or borrowed from someone: direction="lent" when the user gave money out, direction="borrowed" when the user received money.',
      parameters: {
        type: 'object',
        properties: {
          contactName: { type: 'string', description: 'Name of the person lent to or borrowed from' },
          amount: { type: 'number', description: 'Debt amount' },
          currencyCode: { type: 'string', enum: CURRENCY_CODES, description: `Currency code of the debt amount. ${CURRENCY_SYMBOL_HINT}` },
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
      description: 'Update the current saved amount for a savings goal. Use when user says they added money to a goal, saved some amount towards a goal, or want to set the current balance of a goal. Use the goalId from the savingsGoals context — match the goal name the user mentions ("I saved $200 for vacation", "Add $500 to my car goal") against the names there to find the right goalId.',
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
      description: 'Answer "can I afford X" questions. Computes a deterministic YES/NO from the cashflow engine. Use whenever the user asks if they can afford/buy something for an amount ("can I afford X", "can I buy X for N", "do I have enough for X", "is N within my budget"). Report its `affordable` verdict and `reasonCode` verbatim — never guess a yes/no yourself; the verdict is deterministic and your role is only to narrate it in one friendly sentence.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'The price the user wants to spend' },
          currencyCode: { type: 'string', enum: CURRENCY_CODES, description: `Currency code of the price. ${CURRENCY_SYMBOL_HINT} Omit when the user gave none — it then defaults to the user's base/display currency.` },
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
      description: 'Add one or more items to the user\'s shopping / grocery list. Use when the user asks to put something on their shopping list, add groceries to buy, or remember to buy something (e.g. "add milk and bread to my shopping list", "put eggs on the list", "добавь молоко и хлеб в список покупок"). Copy item names in the user\'s own language and spelling. The items are added IMMEDIATELY — there is no confirmation card. This is NOT for recording money spent — that is create_expense.',
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
      description: 'Get the user\'s Inflation Shield: which of their regularly-bought products are rising in price and what to stock up on NOW to save money, plus how much the shield has saved them so far. Use when the user asks what to buy ahead / stock up on, what is getting more expensive, or how much they have saved by buying ahead ("что купить впрок", "what should I stock up on", "co się drożeje"). Read-only, no parameters. Present its numbers verbatim — `monthlyChangePct`, the per-item `quantity`/`projectedSaving` and `savedSoFar` are authoritative. All amounts are already in the user\'s display currency (`baseCurrency`) — label them with that, NOT any per-item `currencyOriginal`. Frame savings as an ESTIMATE ("you\'d save about X"), never a guarantee, and never invent stock-up advice the tool did not return. If `items` is empty, say there is nothing worth stocking up on right now.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_from_shopping_list',
      description: 'Remove one or more items from the user\'s shopping / grocery list, e.g. because they already bought it or added it by mistake. Use for "remove milk from my list", "take eggs off the shopping list", "убери молоко из списка покупок". Copy the item names verbatim from the user\'s message — do NOT translate or correct them. Only removes items not yet checked off; it does NOT record a purchase or check the item off as bought (there is no "mark as bought" tool — removing IS how "I bought X already, take it off my list" is handled).',
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
      description: 'Get what the user is running low on and due to restock, plus any current price deals on their regular purchases. Use for "what am I running low on", "what should I buy", "any deals right now", "чего не хватает". Read-only, no parameters. Not the same as get_inflation_shield: this is about what is due for restock right now and deals available today on the user\'s typical purchases, whereas get_inflation_shield is long-term price-rise forecasts and stocking up AHEAD of an increase.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_deposit_total',
      description:
        'Get how much the user has paid in deposits on returnable packaging (bottles, cans, crates) — the charge printed separately on a receipt and refunded when the packaging is returned. Use for ANY question about this charge in any language: "kaucja" (PL), "Pfand" (DE), "statiegeld" (NL), "consigne" (FR), "depósito"/"envases" (ES), "залог за тару"/"кауция"/"за бутылки" (RU), "застава за тару" (UA), "закладзь за тару" (BE), "bottle deposit"/"can deposit" (EN). Returns the total, the number of receipts, the top stores and the most recent receipts. Read-only. Both dates are OPTIONAL — omit them unless the user named a period, and the whole history is searched (2000-01-01 to today). Report `total`, `receiptCount` and the `byMerchant` stores verbatim; amounts are already in the user\'s display currency (`baseCurrency`). Describe it as the deposit ALREADY PAID on returnable packaging — never state or imply a refund amount the user can collect, because returned packaging is not tracked anywhere in this app and the figure includes deposits on bottles that were long since returned. If `fxApproximate` is set, some deposits could not be converted — mention the untouched amounts from `depositsByCurrency`. If `total` is 0, say no deposit has been recorded and explain that deposits are picked up automatically from scanned receipts. If `encryptionRestricted` is set, say the account\'s amounts are fully encrypted so the assistant cannot read them.',
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
        'Get how much the user has been given in discounts on their purchases — money already taken off a receipt\'s basket, from per-item markdowns or a store coupon. Use for ANY question about this in any language: "rabat"/"zniżka"/"opust" (PL), "Rabatt" (DE), "korting" (NL), "réduction"/"remise" (FR), "descuento" (ES), "скидка" (RU), "знижка" (UA), "зніжка" (BE), "discount" (EN). Returns the total, the number of receipts, the top stores and the most recent receipts. Read-only. Both dates are OPTIONAL — omit them unless the user named a period, and the whole history is searched (2000-01-01 to today). Strictly about discounts already applied on past purchases — not get_inflation_shield (future price forecasts) or get_shopping_suggestions (deals available right now). Report `total`, `receiptCount` and the `byMerchant` stores verbatim; amounts are already in the user\'s display currency (`baseCurrency`). If `fxApproximate` is set, some discounts could not be converted — mention the untouched amounts from `discountsByCurrency`. If `total` is 0, say no discount has been recorded and explain that discounts are picked up automatically from scanned receipts (a manually entered expense or a bank/Wise import carries no discount figure). If `encryptionRestricted` is set, say the account\'s amounts are fully encrypted so the assistant cannot read them.',
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
