import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arrange, chordAt, CHORDS, mondayUTC } from '../src/music/arranger';
import type { Song } from '../src/types';

const deno: Song = JSON.parse(readFileSync('public/presets/deno.json', 'utf8'));
const DAY = 86_400_000;
const PENTA = [0, 2, 4, 7, 9];

function song(commits: [number, number, string][], bots: number[] = []): Song {
  const n = Math.max(...commits.map((c) => c[1])) + 1;
  return {
    repo: 't/t',
    source: 'preset',
    window: { from: '', to: '', capped: false },
    authors: Array.from({ length: n }, (_, i) => ({ key: `u${i}`, login: `u${i}`, name: `u${i}`, avatar: null, bot: bots.includes(i) })),
    commits: commits.map(([day, a, sha]) => ({ t: Date.UTC(2024, 0, 1) + day * DAY + 3600_000, a, sha, msg: 'm' })),
  };
}

describe('arrange', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(arrange(deno))).toBe(JSON.stringify(arrange(deno)));
  });

  it('keeps every melodic note inside the chord (first note of a day) or the chord plus pentatonic scale', () => {
    const score = arrange(deno);
    const melodic = score.notes.filter((n) => n.inst !== 'bass' && n.inst !== 'pad');
    expect(melodic.length).toBeGreaterThan(1000);
    for (const n of melodic) {
      const chord = chordAt(Math.floor(n.beat));
      const pc = n.midi % 12;
      const firstOfDay = n.beat === Math.floor(n.beat);
      if (firstOfDay) expect(chord.tones).toContain(pc);
      else expect([...chord.tones, ...PENTA]).toContain(pc);
    }
  });

  it('gives a contributor an instrument on their third commit, never to bots, and at most six', () => {
    const s = song(
      [
        [0, 0, 'aaaaaaa'], [1, 0, 'bbbbbbb'], [2, 0, 'ccccccc'], // author 0 earns glock on day 2
        [3, 1, 'ddddddd'], [3, 1, 'eeeeeee'], [4, 1, 'fffffff'], // author 1 earns harp on day 4
        [5, 2, '1111111'], [5, 2, '2222222'], [6, 2, '3333333'], // author 2 is a bot
      ],
      [2],
    );
    const score = arrange(s);
    expect(score.voices.map((v) => [v.id, v.author])).toEqual([['glock', 0], ['harp', 1], ['others', null]]);
    const lanes = score.holes.map((h) => h.voice);
    expect(lanes).toEqual(['others', 'others', 'glock', 'others', 'others', 'harp', 'others', 'others', 'others']);
  });

  it('plays at most four notes per voice per day but draws every commit', () => {
    const s = song(Array.from({ length: 10 }, (_, i) => [0, 0, (0x1000000 + i * 977).toString(16)] as [number, number, string]), [0]); // a bot never earns a voice
    const score = arrange(s);
    expect(score.holes).toHaveLength(10);
    expect(score.notes.filter((n) => n.inst === 'others')).toHaveLength(4);
    expect(score.holes.filter((h) => h.sounded)).toHaveLength(4);
  });

  it('keeps the bass going in every bar, including silent weeks', () => {
    const s = song([[0, 0, 'aaaaaaa'], [40, 0, 'bbbbbbb']]);
    const score = arrange(s);
    const bars = score.lengthBeats / 7;
    expect(score.notes.filter((n) => n.inst === 'bass' && n.beat % 7 === 0)).toHaveLength(bars);
    const roots = score.notes.filter((n) => n.inst === 'bass' && n.beat % 7 === 0).map((n) => n.midi % 12);
    roots.forEach((r, b) => expect(r).toBe(CHORDS[b % 4].root));
  });

  it('starts the song on the Monday of the first commit and reports stats', () => {
    const score = arrange(deno);
    expect(new Date(score.start).getUTCDay()).toBe(1);
    expect(score.start).toBe(mondayUTC(deno.commits[0].t));
    expect(score.stats.commits).toBe(deno.commits.length);
    expect(score.stats.busiestBar.commits).toBeGreaterThan(20);
    expect(score.voices[0]).toMatchObject({ id: 'glock' });
    expect(deno.authors[score.voices[0].author!].login).toBe('ry');
  });
});
