import { Engine, type Manifest } from './audio/engine';
import { arrange } from './music/arranger';
import type { Song } from './types';

/** Test hook: render part of a song offline and report its level (used by the Playwright checks). */
export async function renderOffline(song: Song, manifest: Manifest, base: string, seconds: number, fromBeat = 0, only?: string[]) {
  const score = arrange(song);
  const notes = only ? score.notes.filter((n) => only.includes(n.inst)) : score.notes;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * (seconds + 2)), sampleRate);
  const engine = new Engine(ctx, manifest, base);
  await engine.load();
  engine.scheduleAll(notes, seconds, fromBeat);
  const out = await ctx.startRendering();
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sum += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sum / (2 * L.length));
  // 16-bit WAV so the render can be inspected outside the browser.
  const wav = new DataView(new ArrayBuffer(44 + L.length * 4));
  const str = (o: number, s: string) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  wav.setUint32(4, 36 + L.length * 4, true);
  str(8, 'WAVEfmt ');
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, 2, true);
  wav.setUint32(24, sampleRate, true);
  wav.setUint32(28, sampleRate * 4, true);
  wav.setUint16(32, 4, true);
  wav.setUint16(34, 16, true);
  str(36, 'data');
  wav.setUint32(40, L.length * 4, true);
  for (let i = 0; i < L.length; i++) {
    wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  let bin = '';
  const bytes = new Uint8Array(wav.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 20 * Math.log10(rms || 1e-9), wavBase64: btoa(bin) };
}
