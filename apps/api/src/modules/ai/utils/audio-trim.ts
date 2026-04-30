import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

export interface TrimResult {
  buffer: Buffer;
  outputDuration: number;
  inputDuration: number;
  trimmedSec: number;
}

const SILENCE_DB = -45;
const MIN_SILENCE_SEC = 0.5;
const FFMPEG_TIMEOUT_MS = 20_000;

const EXT_FROM_MIME: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/flac': 'flac',
};

function tmpPath(ext: string): string {
  return join(tmpdir(), `aud-${randomBytes(8).toString('hex')}.${ext}`);
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

function run(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

export async function probeDuration(buffer: Buffer, mimeType: string): Promise<number> {
  const ext = EXT_FROM_MIME[mimeType] || 'm4a';
  const inputPath = tmpPath(ext);
  await fs.writeFile(inputPath, buffer);
  try {
    const result = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);
    if (result.code !== 0) {
      throw new Error(`ffprobe exit ${result.code}: ${result.stderr.slice(0, 200)}`);
    }
    const n = parseFloat(result.stdout.trim());
    return Number.isFinite(n) ? n : 0;
  } finally {
    fs.unlink(inputPath).catch(() => undefined);
  }
}

/**
 * Strip leading and trailing silence from an audio buffer using ffmpeg's
 * silenceremove filter. Speech in the middle is preserved (start_periods=1,
 * stop_periods=1). Returns the trimmed buffer plus duration metadata.
 *
 * Fails fast (under FFMPEG_TIMEOUT_MS) so the caller can fall back to the
 * untrimmed buffer if ffmpeg misbehaves.
 */
export async function trimSilence(buffer: Buffer, mimeType: string): Promise<TrimResult> {
  const ext = EXT_FROM_MIME[mimeType] || 'm4a';
  const inputPath = tmpPath(ext);
  const outputPath = tmpPath(ext);
  await fs.writeFile(inputPath, buffer);

  try {
    const inputDuration = await probeDuration(buffer, mimeType);

    const filter =
      `silenceremove=` +
      `start_periods=1:start_silence=${MIN_SILENCE_SEC}:start_threshold=${SILENCE_DB}dB:` +
      `stop_periods=1:stop_silence=${MIN_SILENCE_SEC}:stop_threshold=${SILENCE_DB}dB`;

    const result = await run('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-af', filter,
      outputPath,
    ]);
    if (result.code !== 0) {
      throw new Error(`ffmpeg exit ${result.code}: ${result.stderr.slice(-200)}`);
    }

    const trimmed = await fs.readFile(outputPath);
    const outputDuration = await probeDuration(trimmed, mimeType);

    return {
      buffer: trimmed,
      outputDuration,
      inputDuration,
      trimmedSec: Math.max(0, inputDuration - outputDuration),
    };
  } finally {
    fs.unlink(inputPath).catch(() => undefined);
    fs.unlink(outputPath).catch(() => undefined);
  }
}
