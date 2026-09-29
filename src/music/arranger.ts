import type { Song } from '../types';

/** The instruments contributors can earn, in the order they are handed out. */
export const EARNED = ['glock', 'harp', 'piano', 'violin', 'viola', 'cello'] as const;
export type Earned = (typeof EARNED)[number];
export type VoiceId = Earned | 'others';
export type Instrument = VoiceId | 'bass' | 'pad';

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  glock: 'glockenspiel',
  harp: 'harp',
  piano: 'upright piano',
  violin: 'violin pizzicato',
  viola: 'viola pizzicato',
  cello: 'cello pizzicato',
  others: 'everyone else · soft piano',
  bass: 'double bass',
  pad: 'strings',
};

const RANGE: Record<VoiceId, [number, number]> = {
  glock: [79, 96],
  harp: [60, 84],
  piano: [55, 79],
  violin: [62, 86],
  viola: [55, 76],
  cello: [43, 64],
  others: [60, 84],
};

export const DAYS_PER_BAR = 7;
export const CHORDS = [
  { name: 'C', root: 0, tones: [0, 4, 7] },
  { name: 'Am', root: 9, tones: [9, 0, 4] },
  { name: 'F', root: 5, tones: [5, 9, 0] },
  { name: 'G', root: 7, tones: [7, 11, 2] },
];
const PENTATONIC = [0, 2, 4, 7, 9];
const MAX_NOTES_PER_DAY = 4;
const DAY_MS = 86_400_000;

export type Note = {
  beat: number; // song position in beats (one beat per day)
  inst: Instrument;
  midi: number;
  vel: number; // 0..1
  dur: number; // beats; plucked instruments ring out regardless
  commit?: number; // index into Song.commits
};

export type Voice = { id: VoiceId; author: number | null; earnedBeat: number };

export type Hole = { beat: number; voice: VoiceId; commit: number; sounded: boolean; slot: number; ofDay: number };

export type Stats = {
  commits: number;
  authors: number;
  voices: number;
  busiestBar: { from: number; to: number; commits: number }; // ms timestamps
  longestGapDays: number;
  from: number;
  to: number;
};

export type Score = {
  start: number; // ms: Monday 00:00 UTC of the first commit's week
  lengthBeats: number;
  notes: Note[]; // sorted by beat
  holes: Hole[]; // one per commit, sorted by beat
  voices: Voice[]; // earned voices in order, then "others"
  stats: Stats;
};

export function mondayUTC(t: number): number {
  const d = new Date(t);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  return midnight - weekday * DAY_MS;
}

export function chordAt(beat: number) {
  return CHORDS[Math.floor(beat / DAYS_PER_BAR) % CHORDS.length];
}

/** All MIDI notes in [lo, hi] whose pitch class is in `classes`, ascending. */
function ladder(lo: number, hi: number, classes: number[]): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (classes.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}

function nearestIndex(list: number[], m: number): number {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (Math.abs(list[i] - m) < Math.abs(list[best] - m)) best = i;
  return best;
}

function hashOf(sha: string): number {
  const h = parseInt(sha.slice(0, 7), 16);
  return Number.isFinite(h) ? h : 0;
}

type Walker = { pitch: number; dir: 1 | -1 };

/**
 * One melodic step for a voice. The commit hash decides whether the line keeps its direction
 * (about five times in eight) and whether it moves one or two steps; the step is taken on a
 * ladder of allowed notes, so the result always belongs to the current chord or scale.
 */
function step(w: Walker, sha: string, allowed: number[], strong: boolean, chordLadder: number[]): number {
  const h = hashOf(sha);
  const keep = (h & 0xff) < 160;
  const size = ((h >> 8) & 0xff) < 200 ? 1 : 2;
  let dir: 1 | -1 = keep ? w.dir : w.dir === 1 ? -1 : 1;
  let i = nearestIndex(allowed, w.pitch) + dir * size;
  if (i < 0 || i >= allowed.length) {
    dir = dir === 1 ? -1 : 1;
    i = Math.min(allowed.length - 1, Math.max(0, nearestIndex(allowed, w.pitch) + dir * size));
  }
  let pitch = allowed[i];
  if (strong) pitch = chordLadder[nearestIndex(chordLadder, pitch)];
  w.pitch = pitch;
  w.dir = dir;
  return pitch;
}

/**
 * Commits needed to earn an instrument. Busy repositories need more, so the six instruments go to
 * regulars rather than to the first drive-by contributors. Every song of 300+ commits uses the same
 * threshold, so a live fetch capped at 1,000 commits assigns the same instruments as a full year.
 */
export function earnThreshold(commits: number): number {
  return commits >= 300 ? 10 : commits >= 100 ? 6 : 3;
}

/** Turn a song's commits into a score. Pure and deterministic: the same commits always give the same score. */
export function arrange(song: Song): Score {
  const { commits, authors } = song;
  if (!commits.length) throw new Error('No commits');
  const start = mondayUTC(commits[0].t);
  const dayOf = (t: number) => Math.floor((t - start) / DAY_MS);

  // Who plays what: a contributor earns an instrument once they reach a few commits.
  const need = earnThreshold(commits.length);
  const counts = new Map<number, number>();
  const voiceOf = new Map<number, Earned>();
  const voices: Voice[] = [];
  const laneOfCommit: VoiceId[] = [];
  commits.forEach((c, i) => {
    const n = (counts.get(c.a) ?? 0) + 1;
    counts.set(c.a, n);
    if (n === need && !authors[c.a].bot && !voiceOf.has(c.a) && voices.length < EARNED.length) {
      const id = EARNED[voices.length];
      voiceOf.set(c.a, id);
      voices.push({ id, author: c.a, earnedBeat: dayOf(c.t) });
    }
    laneOfCommit[i] = voiceOf.get(c.a) ?? 'others';
  });
  voices.push({ id: 'others', author: null, earnedBeat: 0 });

  // Group commits by day and voice.
  const byDay = new Map<number, Map<VoiceId, number[]>>();
  commits.forEach((c, i) => {
    const d = dayOf(c.t);
    const lanes = byDay.get(d) ?? new Map<VoiceId, number[]>();
    const list = lanes.get(laneOfCommit[i]) ?? [];
    list.push(i);
    lanes.set(laneOfCommit[i], list);
    byDay.set(d, lanes);
  });

  const walkers = new Map<VoiceId, Walker>();
  const notes: Note[] = [];
  const holes: Hole[] = [];
  const days = [...byDay.keys()].sort((x, y) => x - y);
  for (const d of days) {
    const chord = chordAt(d);
    const lanes = byDay.get(d)!;
    for (const id of [...EARNED, 'others'] as VoiceId[]) {
      const list = lanes.get(id);
      if (!list) continue;
      const [lo, hi] = RANGE[id];
      const chordLadder = ladder(lo, hi, chord.tones);
      const runLadder = ladder(lo, hi, [...new Set([...chord.tones, ...PENTATONIC])]);
      const w = walkers.get(id) ?? { pitch: chordLadder[Math.floor(chordLadder.length / 2)], dir: 1 };
      walkers.set(id, w);
      const sounded = Math.min(list.length, MAX_NOTES_PER_DAY);
      const vel = 0.55 + 0.35 * Math.min(1, (list.length - 1) / 6);
      list.forEach((ci, k) => {
        const played = k < sounded;
        const beat = d + (played ? k / sounded : (sounded - 1) / sounded);
        holes.push({ beat, voice: id, commit: ci, sounded: played, slot: k, ofDay: list.length });
        if (!played) return;
        const pitch = step(w, commits[ci].sha, k === 0 ? chordLadder : runLadder, k === 0, chordLadder);
        notes.push({ beat, inst: id, midi: pitch, vel: k === 0 ? vel : vel * 0.85, dur: 1 / sounded, commit: ci });
      });
    }
  }

  // Bass and a soft string chord keep the harmony going in every bar, busy or quiet.
  const lastDay = dayOf(commits[commits.length - 1].t);
  const bars = Math.floor(lastDay / DAYS_PER_BAR) + 1;
  for (let b = 0; b < bars; b++) {
    const beat = b * DAYS_PER_BAR;
    const chord = chordAt(beat);
    const root = ladder(36, 47, [chord.root])[0];
    const fifth = root + 7 > 47 ? root - 5 : root + 7;
    notes.push({ beat, inst: 'bass', midi: root, vel: 0.75, dur: 2 });
    notes.push({ beat: beat + 4, inst: 'bass', midi: fifth, vel: 0.5, dur: 2 });
    for (const pc of chord.tones) {
      const m = ladder(55, 67, [pc])[0];
      notes.push({ beat, inst: 'pad', midi: m, vel: 0.5, dur: DAYS_PER_BAR });
    }
  }
  notes.sort((x, y) => x.beat - y.beat);
  holes.sort((x, y) => x.beat - y.beat || x.commit - y.commit);

  return { start, lengthBeats: bars * DAYS_PER_BAR, notes, holes, voices, stats: stats(song, start, dayOf, voices.length - 1) };
}

function stats(song: Song, start: number, dayOf: (t: number) => number, voices: number): Stats {
  const { commits, authors } = song;
  const perBar = new Map<number, number>();
  for (const c of commits) {
    const b = Math.floor(dayOf(c.t) / DAYS_PER_BAR);
    perBar.set(b, (perBar.get(b) ?? 0) + 1);
  }
  let busy = [0, 0];
  for (const [b, n] of perBar) if (n > busy[1] || (n === busy[1] && b < busy[0])) busy = [b, n];
  let gap = 0;
  for (let i = 1; i < commits.length; i++) gap = Math.max(gap, dayOf(commits[i].t) - dayOf(commits[i - 1].t) - 1);
  const barStart = start + busy[0] * DAYS_PER_BAR * DAY_MS;
  return {
    commits: commits.length,
    authors: authors.length,
    voices,
    busiestBar: { from: barStart, to: barStart + (DAYS_PER_BAR - 1) * DAY_MS, commits: busy[1] },
    longestGapDays: gap,
    from: commits[0].t,
    to: commits[commits.length - 1].t,
  };
}
