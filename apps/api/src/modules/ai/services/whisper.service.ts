import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { trimSilence, probeDuration } from '../utils/audio-trim';

@Injectable()
export class WhisperService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(WhisperService.name);

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async transcribe(
    audioBuffer: Buffer,
    language?: string,
    mimeType?: string,
  ): Promise<{ text: string; language: string; duration: number; trimmedSec: number }> {
    const detectedMime = mimeType || this.detectMimeType(audioBuffer);
    const ext = this.mimeToExt(detectedMime);

    // Trim leading/trailing silence so we don't pay for empty seconds.
    // gpt-4o-mini-transcribe bills per second of audio; silence costs the same
    // as speech.
    let bufferToSend = audioBuffer;
    let durationSec = 0;
    let trimmedSec = 0;
    try {
      const trimmed = await trimSilence(audioBuffer, detectedMime);
      bufferToSend = trimmed.buffer;
      durationSec = trimmed.outputDuration;
      trimmedSec = trimmed.trimmedSec;
    } catch (err) {
      this.logger.warn(`silence trim failed, using raw buffer: ${(err as Error).message}`);
      durationSec = await probeDuration(audioBuffer, detectedMime).catch(() => 0);
    }

    const arrayBuffer = bufferToSend.buffer.slice(
      bufferToSend.byteOffset,
      bufferToSend.byteOffset + bufferToSend.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: detectedMime });
    const file = new File([blob], `audio.${ext}`, { type: detectedMime });

    const response = await this.openai.audio.transcriptions.create({
      file,
      // gpt-4o-mini-transcribe is ~50% cheaper per minute than whisper-1.
      // It supports response_format 'json' or 'text' only — no verbose_json,
      // so duration and detected language are not returned. Duration comes
      // from ffprobe above; language is whatever the caller passes (or 'en').
      model: 'gpt-4o-mini-transcribe',
      language: language || undefined,
      response_format: 'json',
    });

    this.logger.log(
      `duration=${durationSec.toFixed(2)}s trimmed=${trimmedSec.toFixed(2)}s text_len=${response.text.length}`,
    );

    return {
      text: response.text,
      language: language || 'en',
      duration: durationSec,
      trimmedSec,
    };
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer.length < 12) return 'audio/m4a';
    if (buffer.slice(4, 8).toString() === 'ftyp') return 'audio/m4a';
    if (buffer.slice(0, 4).toString() === 'RIFF') return 'audio/wav';
    if (buffer.slice(0, 4).toString() === 'OggS') return 'audio/ogg';
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'audio/webm';
    if (buffer.slice(0, 3).toString() === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    if (buffer.slice(0, 4).toString() === 'fLaC') return 'audio/flac';
    return 'audio/m4a';
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/flac': 'flac',
    };
    return map[mime] || 'm4a';
  }
}
