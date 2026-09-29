import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine, loadManifest, SECONDS_PER_BEAT, type Manifest } from './audio/engine';
import { renderOffline } from './debug';
import { arrange, type Score } from './music/arranger';
import RollCanvas, { VOICE_COLOR } from './roll/RollCanvas';
import type { Song } from './types';

const BASE = import.meta.env.BASE_URL;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type PresetCard = {
  slug: string;
  repo: string;
  from: string;
  to: string;
  commits: number;
  authors: number;
  lead: { name: string; instrument: string } | null;
};

function monthYear(t: number | string): string {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function shortDate(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** The latest sounded commit under the comb, redrawn only when it changes. */
function Ticker({ song, score, getBeat }: { song: Song; score: Score; getBeat: () => number }) {
  const [idx, setIdx] = useState(-1);
  useEffect(() => {
    let raf = 0;
    let last = -2;
    const tick = () => {
      const beat = getBeat();
      let lo = 0;
      let hi = score.holes.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (score.holes[mid].beat <= beat) lo = mid + 1;
        else hi = mid;
      }
      let i = lo - 1;
      while (i >= 0 && !score.holes[i].sounded) i--;
      const commit = i >= 0 ? score.holes[i].commit : -1;
      if (commit !== last) {
        last = commit;
        setIdx(commit);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, getBeat]);
  if (idx < 0) return <div className="ticker idle">Press play. The first commit is on the comb.</div>;
  const c = song.commits[idx];
  const hole = score.holes.find((h) => h.commit === idx);
  return (
    <div className="ticker" key={idx}>
      <span className="dot" style={{ background: hole ? VOICE_COLOR[hole.voice] : undefined }} />
      <span className="sha">{c.sha}</span>
      <span className="who">{song.authors[c.a].name}</span>
      <span className="when">{shortDate(c.t)}</span>
      <span className="msg">{c.msg}</span>
    </div>
  );
}

function Progress({ score, getBeat }: { score: Score; getBeat: () => number }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');
  useEffect(() => {
    let raf = 0;
    let lastLabel = '';
    const tick = () => {
      const beat = getBeat();
      if (barRef.current) barRef.current.style.width = `${Math.min(100, (beat / score.lengthBeats) * 100)}%`;
      const l = monthYear(score.start + Math.min(beat, score.lengthBeats - 1) * 86_400_000);
      if (l !== lastLabel) {
        lastLabel = l;
        setLabel(l);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, getBeat]);
  return (
    <div className="progress">
      <div className="track">
        <div className="fill" ref={barRef} />
      </div>
      <span className="month">{label}</span>
    </div>
  );
}

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const [presets, setPresets] = useState<PresetCard[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loadingSound, setLoadingSound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<PresetCard[]>('presets/index.json').then(setPresets, () => setPresets([]));
  }, []);

  const getBeat = useCallback(() => engineRef.current?.heardBeat() ?? 0, []);

  async function ensureEngine(): Promise<Engine> {
    if (engineRef.current) return engineRef.current;
    const ctx = new AudioContext();
    const manifest = manifestRef.current ?? (manifestRef.current = await loadManifest(BASE));
    const engine = new Engine(ctx, manifest, BASE);
    setLoadingSound('Tuning the music box…');
    await engine.load((done, total) => setLoadingSound(`Tuning the music box… ${Math.round((done / total) * 100)}%`));
    setLoadingSound(null);
    engineRef.current = engine;
    return engine;
  }

  function show(s: Song) {
    const sc = arrange(s);
    engineRef.current?.setScore(sc.notes);
    setSong(s);
    setScore(sc);
    setPlaying(false);
    setError(null);
  }

  async function openPreset(slug: string) {
    try {
      show(await fetchJson<Song>(`presets/${slug}.json`));
    } catch {
      setError('Could not load that preset. Try reloading the page.');
    }
  }

  async function toggle() {
    if (!score) return;
    const engine = await ensureEngine();
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
      return;
    }
    if (engine.beat() >= score.lengthBeats) engine.setScore(score.notes);
    if (engine.beat() === 0) engine.setScore(score.notes);
    await engine.play();
    setPlaying(true);
  }

  // Stop at the end of the song.
  useEffect(() => {
    if (!playing || !score) return;
    const t = setInterval(() => {
      const engine = engineRef.current;
      if (engine && engine.beat() >= score.lengthBeats + 8) {
        engine.pause();
        setPlaying(false);
      }
    }, 200);
    return () => clearInterval(t);
  }, [playing, score]);

  // Space toggles playback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && score) {
        e.preventDefault();
        void toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Test hooks for the Playwright checks.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__cc = {
      render: async (slug: string, seconds: number, fromBeat = 0, only?: string[]) => {
        const s = await fetchJson<Song>(`presets/${slug}.json`);
        const manifest = manifestRef.current ?? (manifestRef.current = await loadManifest(BASE));
        return renderOffline(s, manifest, BASE, seconds, fromBeat, only);
      },
      beat: () => engineRef.current?.beat() ?? 0,
      contextTime: () => (engineRef.current?.ctx as AudioContext | undefined)?.currentTime ?? 0,
      sync: () => {
        const e = engineRef.current;
        if (!e) return null;
        const ctx = e.ctx as AudioContext;
        return { heard: e.heardBeat(), scheduled: e.beat(), latencyMs: ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000 };
      },
    };
  }, []);

  return (
    <div className="page">
      <header className="top">
        <button className="brand" onClick={() => { engineRef.current?.pause(); setPlaying(false); setSong(null); setScore(null); }}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#221b16" />
            <circle cx="10" cy="11" r="3" fill="#c9a45c" />
            <circle cx="22" cy="21" r="3" fill="#f3d08a" />
            <circle cx="10" cy="23" r="2" fill="#8f8275" />
            <rect x="15" y="5" width="2" height="22" fill="#c9a45c" />
          </svg>
          <span>Commit Chorus</span>
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {!song || !score ? (
        <main className="home">
          <h1>
            Hear the first year of any GitHub repository, <em>played as a music box.</em>
          </h1>
          <p className="lede">
            Every commit is a note. Every week is a bar, and quiet weekends are rests. Regular contributors earn their
            own instrument, so you can hear new people arrive.
          </p>
          <div className="presets">
            {presets.map((p) => (
              <button key={p.slug} className="preset" onClick={() => openPreset(p.slug)}>
                <span className="repo">{p.repo}</span>
                <span className="span">
                  {monthYear(p.from)} – {monthYear(p.to)}
                </span>
                <span className="counts">
                  {p.commits.toLocaleString('en-US')} commits · {p.authors} contributors
                </span>
                {p.lead && (
                  <span className="lead">
                    {p.lead.name} opens on {p.lead.instrument}
                  </span>
                )}
                <span className="go">Listen →</span>
              </button>
            ))}
          </div>
        </main>
      ) : (
        <main className="player">
          <div className="songhead">
            <div>
              <h2>
                <a href={`https://github.com/${song.repo}`} target="_blank" rel="noreferrer">
                  {song.repo}
                </a>
              </h2>
              <p>
                First year · {monthYear(score.stats.from)} – {monthYear(score.stats.to)} · {score.stats.commits.toLocaleString('en-US')}{' '}
                commits · {score.voices.length - 1} earned instruments
              </p>
            </div>
          </div>
          <div className="box">
            <RollCanvas song={song} score={score} getBeat={getBeat} />
            <Ticker song={song} score={score} getBeat={getBeat} />
          </div>
          <div className="transport">
            <button className={`play ${playing ? 'on' : ''}`} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!!loadingSound}>
              {playing ? (
                <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
              )}
            </button>
            <Progress score={score} getBeat={getBeat} />
            <span className="hint">{loadingSound ?? `about ${Math.round((score.lengthBeats * SECONDS_PER_BEAT) / 5) * 5} s`}</span>
          </div>
        </main>
      )}

      <footer className="foot">
        Instruments: VSCO-2 Community Edition (CC0). Commits from the public GitHub API.
      </footer>
    </div>
  );
}
