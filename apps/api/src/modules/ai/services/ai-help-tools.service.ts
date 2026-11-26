import { Injectable } from '@nestjs/common';
import type { ChatActionResult } from '@budget/shared-types';
import { searchHelp, type HelpIndex } from '../help/help-search.util';
import * as helpIndexJson from '../help/help-index.json';

/**
 * `search_help` — answers "how does the app work" from the generated help index
 * (scripts/generate-help-content.js). Touches NO account data, so it is safe for
 * viewers and needs no accountId. Contract: docs/contracts/ai-chat-help-search.md.
 */
@Injectable()
export class AiHelpToolsService {
  private readonly index = helpIndexJson as unknown as HelpIndex;

  async executeSearchHelp(data: Record<string, unknown>): Promise<ChatActionResult> {
    const query = typeof data.query === 'string' ? data.query.trim() : '';
    const language = typeof data.language === 'string' ? data.language : 'en';
    const matches = searchHelp(this.index, query, language);
    return {
      actionType: 'search_help',
      success: true,
      data: {
        query,
        language,
        matches,
        note: matches.length
          ? 'Answer only from these excerpts and name the article. Do not invent screens or settings.'
          : 'No help article matched. Say so plainly and suggest Settings → Help; do not guess.',
      },
    };
  }
}
