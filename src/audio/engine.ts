import type { Instrument, Note } from '../music/arranger';

type SampleEntry = { midi: number; cents: number; file: string };
export type Manifest = Record<string, SampleEntry[]>;
type Loaded = { midi: number; cents: number; buffer: AudioBuffer };

/** Which recordings each instrument plays, and its place in the mix. */
const MIX: Record<Instrument, { samples: string; gain: number; pan: number; sustain?: boolean }> = {
  glock: { samples: 'glock', gain: 0.42, pan: 0 },
  harp: { samples: 'harp', gain: 0.75, pan: -0.3 },
  piano: { samples: 'piano', gain: 0.62, pan: 0.22 },
  violin: { samples: 'violin', gain: 0.62, pan: -0.45 },
  viola: { samples: 'viola', gain: 0.62, pan: 0.4 },
  cello: { samples: 'cello', gain: 0.5, pan: -0.15 },
  others: { samples: 'piano', gain: 0.24, pan: 0.1 },
  bass: { samples: 'bass', gain: 0.62, pan: 0 },
  pad: { samples: 'pad', gain: 0.16, pan: 0, sustain: true },
};

export const SECONDS_PER_BEAT = 0.25; // one day of history at normal speed

export async function loadManifest(base: string): Promise<Manifest> {
  const res = await fetch(`${base}samples/manifest.json`);
  return (await res.json()) as Manifest;
}

/** A generated room: a short burst of decaying stereo noise, gently darkened. */
function impulse(ctx: BaseAudioContext, seconds = 2.4): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += 0.35 * (rand() - lp);
      d[i] = lp * Math.pow(1 - i / len, 3.2);
    }
  }
  return ir;
}

/**
 * Plays a score on any BaseAudioContext. Live playback schedules notes a little ahead of the
 * clock; offline rendering schedules everything at once.
 */
export class Engine {
  private samples = new Map<string, Loaded[]>();
  private buses = new Map<Instrument, GainNode>();
  private master: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private notes: Note[] = [];
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private originCtx = 0; // context time of beat 0
  private pausedBeat = 0;
  private secondsPerBeat = SECONDS_PER_BEAT;
  private out: AudioNode;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  playing = false;

  /** Record what the listener hears (used to make the demo video). Returns the epoch time recording began. */
  startRecording(): Promise<number> {
    const ctx = this.ctx as AudioContext;
    const dest = ctx.createMediaStreamDestination();
    this.out.connect(dest);
    this.chunks = [];
    this.recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256_000 });
    this.recorder.ondataavailable = (e) => this.chunks.push(e.data);
    return new Promise((resolve) => {
      this.recorder!.onstart = () => resolve(performance.timeOrigin + performance.now());
      this.recorder!.start(1000);
    });
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(new Blob());
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: 'audio/webm' }));
      this.recorder.stop();
    });
  }

  constructor(
    public ctx: BaseAudioContext,
    private manifest: Manifest,
    private base: string,
  ) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.master.connect(comp);
    this.master.connect(verb).connect(wet).connect(comp);
    comp.connect(ctx.destination);
    this.out = comp;
    for (const [inst, mix] of Object.entries(MIX) as [Instrument, (typeof MIX)[Instrument]][]) {
      const g = ctx.createGain();
      g.gain.value = mix.gain;
      const pan = ctx.createStereoPanner();
      pan.pan.value = mix.pan;
      g.connect(pan).connect(this.master);
      this.buses.set(inst, g);
    }
  }

  async load(onProgress?: (done: number, total: number) => void): Promise<void> {
    const entries = Object.entries(this.manifest).flatMap(([name, list]) => list.map((e) => ({ name, e })));
    let done = 0;
    await Promise.all(
      entries.map(async ({ name, e }) => {
        const data = await (await fetch(`${this.base}samples/${e.file}`)).arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(data);
        const list = this.samples.get(name) ?? [];
        list.push({ midi: e.midi, cents: e.cents, buffer });
        this.samples.set(name, list);
        onProgress?.(++done, entries.length);
      }),
    );
    for (const list of this.samples.values()) list.sort((a, b) => a.midi - b.midi);
  }

  /** Schedule one note at a context time. */
  private sound(n: Note, when: number): void {
    const mix = MIX[n.inst];
    const list = this.samples.get(mix.samples);
    if (!list?.length) return;
    let s = list[0];
    for (const x of list) if (Math.abs(x.midi - n.midi) < Math.abs(s.midi - n.midi)) s = x;
    const src = this.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (n.midi - s.midi - s.cents / 100) / 12);
    const g = this.ctx.createGain();
    const peak = 0.25 + 0.75 * n.vel;
    if (mix.sustain) {
      const dur = n.dur * this.secondsPerBeat;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(peak, when + Math.min(0.4, dur * 0.4));
      g.gain.setValueAtTime(peak, when + Math.max(0.05, dur - 0.5));
      g.gain.linearRampToValueAtTime(0, when + dur + 0.35);
      src.connect(g).connect(this.buses.get(n.inst)!);
      src.start(when);
      src.stop(when + dur + 0.4);
    } else {
      g.gain.value = peak;
      src.connect(g).connect(this.buses.get(n.inst)!);
      src.start(when);
    }
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  setScore(notes: Note[]): void {
    this.stopAll();
    this.notes = notes;
    this.next = 0;
    this.pausedBeat = 0;
    this.playing = false;
  }

  /** Current song position in beats, as scheduled. */
  beat(): number {
    if (!this.playing) return this.pausedBeat;
    return Math.max(0, (this.ctx.currentTime - this.originCtx) / this.secondsPerBeat);
  }

  /** The position the listener is hearing right now: scheduled time minus the device's output delay. */
  heardBeat(): number {
    if (!this.playing) return this.pausedBeat;
    const ctx = this.ctx as AudioContext;
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return Math.max(0, (ctx.currentTime - latency - this.originCtx) / this.secondsPerBeat);
  }

  private seekIndex(beat: number): void {
    let lo = 0;
    let hi = this.notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.notes[mid].beat < beat) lo = mid + 1;
      else hi = mid;
    }
    this.next = lo;
  }

  private pump = (): void => {
    const horizon = this.ctx.currentTime + 0.15;
    while (this.next < this.notes.length) {
      const n = this.notes[this.next];
      const when = this.originCtx + n.beat * this.secondsPerBeat;
      if (when > horizon) break;
      if (when >= this.ctx.currentTime - 0.02) this.sound(n, Math.max(when, this.ctx.currentTime));
      this.next++;
    }
  };

  async play(fromBeat = this.pausedBeat): Promise<void> {
    const ctx = this.ctx as AudioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    this.stopAll();
    this.originCtx = ctx.currentTime + 0.06 - fromBeat * this.secondsPerBeat;
    this.seekIndex(fromBeat);
    this.playing = true;
    this.pump();
    this.timer = setInterval(this.pump, 25);
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedBeat = this.beat();
    this.playing = false;
    this.stopAll();
  }

  setSpeed(secondsPerBeat: number): void {
    const wasPlaying = this.playing;
    const at = this.beat();
    this.secondsPerBeat = secondsPerBeat;
    this.pausedBeat = at;
    if (wasPlaying) void this.play(at);
  }

  get speed(): number {
    return this.secondsPerBeat;
  }

  private stopAll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    for (const s of this.sources) {
      try {
        s.stop(now + 0.03);
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
  }

  /** Offline use: schedule every note that starts before `seconds`. */
  scheduleAll(notes: Note[], seconds: number, fromBeat = 0): void {
    for (const n of notes) {
      const when = (n.beat - fromBeat) * this.secondsPerBeat;
      if (when < 0) continue;
      if (when > seconds) break;
      this.sound(n, when);
    }
  }
}
