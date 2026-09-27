import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenAISpeechLike = { audio: { speech: { create(args: any): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> } } };

const MAX_INPUT_CHARS = 1500;

/**
 * Speaks the narrated digest text with OpenAI TTS, returning an Ogg/Opus
 * buffer ready to send as a voice note. `lang` is accepted for symmetry with
 * `VoiceDigestNarratorService.narrate` (the caller has one language for the
 * whole digest) but gpt-4o-mini-tts takes no language parameter of its own —
 * it infers it from `input`. Same optional-injected-client constructor shape
 * as `CoicopClassifierService`/`VoiceDigestNarratorService`, and never throws
 * — any failure (including a missing OPENAI_API_KEY) degrades to `null` so a
 * digest send can still deliver its text.
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly openai: OpenAISpeechLike | null;

  constructor(config: ConfigService, @Optional() openai?: OpenAISpeechLike | null) {
    const key = config.get<string>('OPENAI_API_KEY');
    this.openai = openai ?? (key ? (new OpenAI({ apiKey: key, timeout: 30_000, maxRetries: 0 }) as unknown as OpenAISpeechLike) : null);
  }

  // `_lang` (not read): kept for a symmetric signature with narrate() — gpt-4o-mini-tts
  // has no language parameter of its own, it infers pronunciation from `input`.
  async synthesize(text: string, _lang: string): Promise<Buffer | null> {
    if (!this.openai) {
      return null;
    }

    try {
      const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
      const res = await this.openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        input,
        response_format: 'opus',
      });
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Voice digest TTS synthesis failed: ${message}`);
      return null;
    }
  }
}
