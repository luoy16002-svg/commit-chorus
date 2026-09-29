import { useEffect, useRef } from 'react';
import { CHORDS, DAYS_PER_BAR, INSTRUMENT_LABEL, type Hole, type Score, type VoiceId } from '../music/arranger';
import type { Song } from '../types';

export const VOICE_COLOR: Record<VoiceId, string> = {
  glock: '#f3d08a',
  harp: '#e8a66a',
  piano: '#efe6d6',
  violin: '#e3a0a0',
  viola: '#a9c79a',
  cello: '#86bfb7',
  others: '#8f8275',
};

const RULER = 34;
const LANE = 46;
const GUTTER = 212;
const PX_PER_DAY = 15;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Props = { song: Song; score: Score; getBeat: () => number };

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function firstAtOrAfter(holes: Hole[], beat: number): number {
  let lo = 0;
  let hi = holes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (holes[mid].beat < beat) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const MIN_HEIGHT = 300;

export function rollHeight(score: Score): number {
  return Math.max(MIN_HEIGHT, RULER + score.voices.length * LANE + 14);
}

/** Centre of lane i; lanes are centred vertically when there are only a few. */
function laneCenter(score: Score, i: number): number {
  const used = score.voices.length * LANE;
  const top = RULER + Math.max(0, (rollHeight(score) - RULER - 14 - used) / 2);
  return top + i * LANE + LANE / 2 + 4;
}

export default function RollCanvas({ song, score, getBeat }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatars = useRef(new Map<number, HTMLImageElement>());

  useEffect(() => {
    for (const v of score.voices) {
      if (v.author === null) continue;
      const url = song.authors[v.author].avatar;
      if (!url || avatars.current.has(v.author)) continue;
      const img = new Image();
      img.src = url;
      avatars.current.set(v.author, img);
    }
  }, [song, score]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let width = 0;
    const height = rollHeight(score);
    const laneIndex = new Map(score.voices.map((v, i) => [v.id, i]));
    const laneY = (id: VoiceId) => laneCenter(score, laneIndex.get(id) ?? 0);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = () => {
      const beat = getBeat();
      const comb = GUTTER + (width - GUTTER) * 0.3;
      const xOf = (b: number) => comb + (b - beat) * PX_PER_DAY;
      const firstBeat = beat - (comb - GUTTER) / PX_PER_DAY - 2;
      const lastBeat = beat + (width - comb) / PX_PER_DAY + 2;

      ctx.clearRect(0, 0, width, height);
      // The roll: dark paper with lane grooves.
      ctx.fillStyle = '#1c1713';
      ctx.fillRect(GUTTER, 0, width - GUTTER, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(GUTTER, 0, width - GUTTER, height);
      ctx.clip();

      // Weekends and bar lines, chord names in the ruler.
      for (let d = Math.floor(firstBeat); d <= lastBeat; d++) {
        const x = xOf(d);
        const dow = ((d % 7) + 7) % 7;
        if (dow >= 5) {
          ctx.fillStyle = 'rgba(255,240,220,0.022)';
          ctx.fillRect(x, RULER, PX_PER_DAY, height - RULER);
        }
        if (dow === 0) {
          ctx.fillStyle = 'rgba(201,164,92,0.13)';
          ctx.fillRect(x, RULER - 6, 1, height - RULER + 6);
          const chord = CHORDS[(((Math.floor(d / DAYS_PER_BAR) % CHORDS.length) + CHORDS.length) % CHORDS.length)];
          ctx.fillStyle = 'rgba(201,164,92,0.55)';
          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.fillText(chord.name, x + 4, RULER - 8);
        }
      }
      // Month labels; the current month stays pinned at the left edge of the roll.
      const start = new Date(score.start);
      const current = new Date(score.start + Math.max(0, firstBeat + 2) * DAY_MS);
      for (let k = -1; k < 16; k++) {
        const m = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1);
        const b = (m - score.start) / DAY_MS;
        if (b < firstBeat - 40 || b > lastBeat) continue;
        const x = xOf(b);
        const d = new Date(m);
        ctx.fillStyle = '#c9b89f';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillText(`${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, x + 4, 15);
        ctx.fillStyle = 'rgba(239,230,214,0.25)';
        ctx.fillRect(x, 4, 1, 16);
      }
      const pinned = `${MONTHS[current.getUTCMonth()]} ${current.getUTCFullYear()}`;
      ctx.fillStyle = '#1c1713';
      ctx.fillRect(GUTTER, 0, 92, 21);
      ctx.fillStyle = '#c9b89f';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText(pinned, GUTTER + 8, 15);
      // Lane grooves.
      for (let i = 0; i < score.voices.length; i++) {
        const y = laneCenter(score, i);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(GUTTER, y - 0.5, width - GUTTER, 1);
      }

      // Punched holes. Struck ones bloom as they cross the comb, then fade to a warm ember.
      const holes = score.holes;
      for (let i = firstAtOrAfter(holes, firstBeat); i < holes.length && holes[i].beat <= lastBeat; i++) {
        const h = holes[i];
        const x = xOf(h.beat);
        const y = laneY(h.voice);
        const color = VOICE_COLOR[h.voice];
        const since = beat - h.beat;
        const w = h.sounded ? 9 : 5;
        const hh = h.sounded ? 16 : 10;
        if (since >= 0 && h.sounded) {
          const glow = Math.max(0, 1 - since / 2.2);
          if (glow > 0) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
            g.addColorStop(0, rgba(color, 0.55 * glow));
            g.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = g;
            ctx.fillRect(x - 26, y - 26, 52, 52);
          }
          ctx.fillStyle = rgba(color, 0.42 + 0.58 * glow);
        } else {
          ctx.fillStyle = rgba(color, h.sounded ? 0.3 : 0.16);
        }
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - hh / 2, w, hh, w / 2);
        ctx.fill();
      }
      ctx.restore();

      // The comb: a brass bar with a tooth per lane.
      const grd = ctx.createLinearGradient(comb - 30, 0, comb + 6, 0);
      grd.addColorStop(0, 'rgba(243,208,138,0)');
      grd.addColorStop(1, 'rgba(243,208,138,0.07)');
      ctx.fillStyle = grd;
      ctx.fillRect(comb - 30, RULER, 36, height - RULER);
      ctx.fillStyle = '#c9a45c';
      ctx.fillRect(comb - 1.5, RULER - 4, 3, height - RULER + 4);
      for (let i = 0; i < score.voices.length; i++) {
        const y = laneCenter(score, i);
        ctx.fillRect(comb - 9, y - 1, 9, 2);
      }

      // Lane labels in the gutter; a lane lights up once its contributor has earned it.
      ctx.fillStyle = '#15110e';
      ctx.fillRect(0, 0, GUTTER, height);
      score.voices.forEach((v, i) => {
        const y = laneCenter(score, i);
        const earned = v.author === null || beat >= v.earnedBeat;
        ctx.globalAlpha = earned ? 1 : 0.22;
        const color = VOICE_COLOR[v.id];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(20, y, 14, 0, Math.PI * 2);
        ctx.stroke();
        const img = v.author !== null ? avatars.current.get(v.author) : undefined;
        if (img?.complete && img.naturalWidth) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(20, y, 12.5, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, 7.5, y - 12.5, 25, 25);
          ctx.restore();
        } else {
          ctx.fillStyle = rgba(color, 0.25);
          ctx.beginPath();
          ctx.arc(20, y, 12.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.font = '600 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(v.author === null ? '···' : song.authors[v.author].name.slice(0, 2).toUpperCase(), 20, y + 4);
          ctx.textAlign = 'left';
        }
        ctx.fillStyle = '#efe6d6';
        ctx.font = '600 13px system-ui, sans-serif';
        const name = v.author === null ? 'Everyone else' : song.authors[v.author].name;
        ctx.fillText(name.length > 18 ? name.slice(0, 17) + '…' : name, 44, y - 2);
        ctx.fillStyle = rgba(color, 0.85);
        ctx.font = '400 11px "JetBrains Mono", monospace';
        ctx.fillText(v.author === null ? 'soft piano' : INSTRUMENT_LABEL[v.id], 44, y + 13);
        ctx.globalAlpha = 1;
      });
      ctx.fillStyle = 'rgba(201,164,92,0.35)';
      ctx.fillRect(GUTTER - 1, 0, 1, height);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [song, score, getBeat]);

  return <canvas ref={canvasRef} className="roll" style={{ height: rollHeight(score) }} />;
}
