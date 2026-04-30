import { spawnSync } from 'child_process';
import { trimSilence, probeDuration } from './audio-trim';

const ffmpegAvailable = (() => {
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true });
    return r.status === 0;
  } catch {
    return false;
  }
})();

// Skip locally when ffmpeg isn't on PATH; runs in Docker / CI where ffmpeg is
// installed via the API runtime image.
const describeIfFfmpeg = ffmpegAvailable ? describe : describe.skip;

/**
 * Build a synthetic mono 16-bit PCM WAV in pure Node — avoids checking a
 * binary fixture into git and avoids needing ffmpeg to *generate* test input.
 */
function makeWav(silencePreSec: number, toneSec: number, silencePostSec: number): Buffer {
  const sampleRate = 16000;
  const total = silencePreSec + toneSec + silencePostSec;
  const totalSamples = Math.floor(total * sampleRate);
  const dataSize = totalSamples * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  const preSamples = Math.floor(silencePreSec * sampleRate);
  const toneSamples = Math.floor(toneSec * sampleRate);
  for (let i = 0; i < toneSamples; i++) {
    const t = i / sampleRate;
    const amp = Math.floor(0.5 * 32767 * Math.sin(2 * Math.PI * 440 * t));
    data.writeInt16LE(amp, (preSamples + i) * 2);
  }
  return Buffer.concat([header, data]);
}

describeIfFfmpeg('audio-trim (requires ffmpeg)', () => {
  it('probeDuration reports input duration in seconds', async () => {
    const wav = makeWav(0, 3, 0);
    const dur = await probeDuration(wav, 'audio/wav');
    expect(dur).toBeGreaterThan(2.5);
    expect(dur).toBeLessThan(3.5);
  }, 30_000);

  it('trims leading and trailing silence', async () => {
    const wav = makeWav(2, 1, 2);
    const inputDuration = await probeDuration(wav, 'audio/wav');
    expect(inputDuration).toBeGreaterThanOrEqual(4.5);

    const result = await trimSilence(wav, 'audio/wav');
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.outputDuration).toBeGreaterThan(0);
    expect(result.outputDuration).toBeLessThan(inputDuration);
    expect(result.trimmedSec).toBeGreaterThan(1.5);
    expect(result.inputDuration).toBeCloseTo(inputDuration, 1);
  }, 30_000);

  it('passes through audio without leading/trailing silence', async () => {
    const wav = makeWav(0, 2, 0);
    const result = await trimSilence(wav, 'audio/wav');
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.trimmedSec).toBeLessThan(0.5);
  }, 30_000);
});

if (!ffmpegAvailable) {
  // Surface a single test so jest doesn't report "no tests" — skipped above.
  it.skip('audio-trim suite skipped: ffmpeg not on PATH (runs in Docker / CI)', () => undefined);
}
