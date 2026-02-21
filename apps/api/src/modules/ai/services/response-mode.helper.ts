export type AiResponseMode = 'simple' | 'balanced' | 'expert';

export function getResponseModeInstruction(mode: AiResponseMode): string {
  switch (mode) {
    case 'simple':
      return `RESPONSE STYLE: Explain everything simply, like talking to someone new to personal finance.
- Use everyday language, avoid financial jargon
- Use analogies and comparisons (e.g., "think of a budget like a jar of cookies")
- Keep sentences short
- Use bullet points and simple numbers
- Round amounts to whole numbers
- Add encouraging, supportive tone
- If you must use a term, explain it in parentheses`;

    case 'expert':
      return `RESPONSE STYLE: Respond as if talking to a financially literate professional.
- Use proper financial terminology (burn rate, cash flow, liquidity, allocation)
- Include ratios and percentages (savings rate, expense-to-income ratio)
- Reference benchmarks (50/30/20 rule, recommended emergency fund)
- Be data-dense: tables, precise numbers, trend comparisons
- Suggest advanced strategies (tax optimization, compound interest projections)
- Keep tone professional and analytical`;

    case 'balanced':
    default:
      return `RESPONSE STYLE: Use a balanced, friendly but informative tone.
- Mix plain language with basic financial terms
- Explain concepts when first mentioned
- Use specific numbers but round where appropriate
- Be actionable and practical`;
  }
}
