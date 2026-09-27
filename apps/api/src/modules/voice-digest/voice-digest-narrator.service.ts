import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CHEAP_MODEL } from '../ai/services/model-resolver';
import { fallbackText, isFaithful } from './digest-text.util';
import type { DigestFacts } from './digest-facts.util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenAIChatLike = { chat: { completions: { create(args: any): Promise<any> } } };

const MAX_OUTPUT_CHARS = 1200;

/** Maps the app's 9 locale codes to the language name the model is told to reply in. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  ua: 'Ukrainian',
  be: 'Belarusian',
  nl: 'Dutch',
};

function languageName(lang: string): string {
  return LANGUAGE_NAMES[lang] ?? 'English';
}

function buildSystemPrompt(lang: string): string {
  const language = languageName(lang);
  return [
    `You write a short friendly spoken summary of a personal weekly spending digest, entirely in ${language}.`,
    'Rules:',
    `- Reply only in ${language}.`,
    '- Plain spoken sentences meant to be read aloud: no markdown, no emoji, no bullet points, no headings.',
    '- At most 130 words.',
    '- Use only the numbers given in the facts, and write each exactly as given, as plain digits with no thousands separators (e.g. write 1234, never 1,234 or 1.234).',
    '- Never attribute a number to a different fact than the one it belongs to.',
    "- Never invert a direction the facts state (e.g. do not say a figure is above usual when the facts say it is below, or that a price will fall when the facts say it will rise).",
    '- Do not add advice, recommendations, or any commentary beyond what the facts say.',
    '- Do not greet the user or address them by name; do not use any name at all.',
  ].join('\n');
}

/**
 * Turns the week's DigestFacts into spoken-style text for the Telegram /
 * WhatsApp / Slack voice digest. The model only ever sees the already-computed
 * facts (never raw expenses, ids, or user identity) and its output is
 * number-checked against those same facts before being trusted — an invented,
 * misattributed, or direction-inverted number falls back to the deterministic
 * `fallbackText`, same as a thrown call, an empty reply, or an unusually long
 * one. Same optional-injected-client constructor shape as
 * `CoicopClassifierService` so tests never need a real API key.
 */
@Injectable()
export class VoiceDigestNarratorService {
  private readonly logger = new Logger(VoiceDigestNarratorService.name);
  private readonly openai: OpenAIChatLike | null;

  constructor(config: ConfigService, @Optional() openai?: OpenAIChatLike | null) {
    const key = config.get<string>('OPENAI_API_KEY');
    this.openai = openai ?? (key ? (new OpenAI({ apiKey: key, timeout: 15_000, maxRetries: 0 }) as unknown as OpenAIChatLike) : null);
  }

  async narrate(facts: DigestFacts, lang: string): Promise<{ text: string; usedModel: boolean }> {
    if (!this.openai) {
      return { text: fallbackText(facts, lang), usedModel: false };
    }

    try {
      const res = await this.openai.chat.completions.create({
        model: CHEAP_MODEL,
        temperature: 0.3,
        max_tokens: 350,
        messages: [
          { role: 'system', content: buildSystemPrompt(lang) },
          { role: 'user', content: JSON.stringify(facts) },
        ],
      });
      const text = (res.choices?.[0]?.message?.content ?? '').trim();
      if (!text || text.length > MAX_OUTPUT_CHARS || !isFaithful(text, facts)) {
        return { text: fallbackText(facts, lang), usedModel: false };
      }
      return { text, usedModel: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Voice digest narration failed, using fallback: ${message}`);
      return { text: fallbackText(facts, lang), usedModel: false };
    }
  }
}
