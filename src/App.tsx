import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine, loadManifest, SECONDS_PER_BEAT, type Manifest } from './audio/engine';
import { renderOffline } from './debug';
import { loadRepo, RepoError } from './loader/github';
import { parseRepo } from './loader/repo';
import { arrange, type Score } from './music/arranger';
import RollCanvas, { VOICE_COLOR } from './roll/RollCanvas';
import type { Song } from './types';

const BASE = import.meta.env.BASE_URL;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PRESET_SLUG: Record<string, string> = { 'denoland/deno': 'deno', 'vitejs/vite': 'vite', 'oven-sh/bun': 'bun' };

function dayRange(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  const left = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`;
  const right = a.getUTCMonth() === b.getUTCMonth() ? `${b.getUTCDate()}` : `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
  return `${left} – ${right}, ${b.getUTCFullYear()}`;
}

function shareUrl(repo: string): string {
  return `${location.origin}${BASE}?repo=${repo}`;
}

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
  const scoreRef = useRef<Score | null>(null);
  scoreRef.current = score;
  const [playing, setPlaying] = useState(false);
  const [loadingSound, setLoadingSound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [fetching, setFetching] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [fast, setFast] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setEnded(false);
    setCopied(false);
    setError(null);
    history.replaceState(null, '', `${BASE}?repo=${s.repo}`);
  }

  function goHome() {
    engineRef.current?.pause();
    setPlaying(false);
    setSong(null);
    setScore(null);
    setEnded(false);
    history.replaceState(null, '', BASE);
  }

  async function restart() {
    if (!score) return;
    const engine = await ensureEngine();
    engine.setScore(score.notes);
    engine.setSpeed(fast ? SECONDS_PER_BEAT / 2 : SECONDS_PER_BEAT);
    setEnded(false);
    await engine.play(0);
    setPlaying(true);
  }

  function toggleSpeed() {
    const next = !fast;
    setFast(next);
    engineRef.current?.setSpeed(next ? SECONDS_PER_BEAT / 2 : SECONDS_PER_BEAT);
  }

  async function copyLink() {
    if (!song) return;
    try {
      await navigator.clipboard.writeText(shareUrl(song.repo));
    } catch {
      /* the same link is in the address bar */
    }
    setCopied(true);
  }

  async function openPreset(slug: string) {
    try {
      show(await fetchJson<Song>(`presets/${slug}.json`));
    } catch {
      setError('Could not load that preset. Try reloading the page.');
    }
  }

  async function openRepo(input: string) {
    const ref = parseRepo(input);
    if (!ref) {
      setError('Type a repository as owner/name, or paste its GitHub link.');
      return;
    }
    setError(null);
    setFetching(`Reading ${ref.owner}/${ref.name}…`);
    try {
      const s = await loadRepo(ref, {
        onProgress: (n) => setFetching(`Reading ${ref.owner}/${ref.name}… ${n.toLocaleString('en-US')} commits`),
      });
      engineRef.current?.pause();
      show(s);
      setQuery('');
    } catch (e) {
      if (e instanceof RepoError && e.kind === 'rate-limited') {
        const at = e.resetAt ? e.resetAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'within the hour';
        setError(`GitHub allows a limited number of anonymous requests per hour, and they're used up. They reset at ${at}. The presets still play.`);
      } else {
        setError(e instanceof RepoError ? e.message : 'Something went wrong while reading that repository.');
      }
    } finally {
      setFetching(null);
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
    if (ended || engine.beat() >= score.lengthBeats) return restart();
    if (engine.beat() === 0) engine.setScore(score.notes);
    engine.setSpeed(fast ? SECONDS_PER_BEAT / 2 : SECONDS_PER_BEAT);
    await engine.play();
    setPlaying(true);
  }

  // Stop at the end of the song.
  useEffect(() => {
    if (!playing || !score) return;
    const t = setInterval(() => {
      const engine = engineRef.current;
      if (engine && engine.beat() >= score.lengthBeats + 6) {
        engine.pause();
        setPlaying(false);
        setEnded(true);
      }
    }, 200);
    return () => clearInterval(t);
  }, [playing, score]);

  // A shared link (?repo=owner/name) opens straight into the player.
  useEffect(() => {
    const repo = new URLSearchParams(location.search).get('repo');
    if (!repo) return;
    const slug = PRESET_SLUG[repo.toLowerCase()];
    if (slug) void openPreset(slug);
    else void openRepo(repo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      href: () => location.href,
      opening: (n: number) => scoreRef.current?.notes.slice(0, n).map((x) => [x.beat, x.inst, x.midi]) ?? null,
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
        <button className="brand" onClick={goHome}>
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#221b16" />
            <circle cx="10" cy="11" r="3" fill="#c9a45c" />
            <circle cx="22" cy="21" r="3" fill="#f3d08a" />
            <circle cx="10" cy="23" r="2" fill="#8f8275" />
            <rect x="15" y="5" width="2" height="22" fill="#c9a45c" />
          </svg>
          <span>Commit Chorus</span>
        </button>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            void openRepo(query);
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="owner/repo or a GitHub link"
            aria-label="GitHub repository"
            disabled={!!fetching}
            spellCheck={false}
          />
          <button type="submit" disabled={!!fetching || !query.trim()}>
            {fetching ? 'Reading…' : 'Play its first year'}
          </button>
        </form>
      </header>
      {fetching && <p className="status">{fetching}</p>}

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
                {song.window.capped ? `First ${score.stats.commits.toLocaleString('en-US')} commits` : 'First year'} ·{' '}
                {monthYear(score.stats.from)} – {monthYear(score.stats.to)}
                {!song.window.capped && ` · ${score.stats.commits.toLocaleString('en-US')} commits`} · {score.voices.length - 1} earned
                instruments
              </p>
            </div>
          </div>
          <div className="box">
            <RollCanvas song={song} score={score} getBeat={getBeat} />
            <Ticker song={song} score={score} getBeat={getBeat} />
            {ended && (
              <div className="endcard" role="dialog" aria-label="Song finished">
                <p className="kicker">That was</p>
                <h3>
                  {song.repo}, {song.window.capped ? 'the opening months' : 'the first year'}
                </h3>
                <dl>
                  <div>
                    <dt>Commits played</dt>
                    <dd>{score.stats.commits.toLocaleString('en-US')}</dd>
                  </div>
                  <div>
                    <dt>Earned instruments</dt>
                    <dd>{score.voices.length - 1}</dd>
                  </div>
                  <div>
                    <dt>Busiest week</dt>
                    <dd>
                      {dayRange(score.stats.busiestBar.from, score.stats.busiestBar.to)}
                      <small>{score.stats.busiestBar.commits} commits</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Longest silence</dt>
                    <dd>
                      {score.stats.longestGapDays} {score.stats.longestGapDays === 1 ? 'day' : 'days'}
                    </dd>
                  </div>
                </dl>
                <div className="actions">
                  <button className="primary" onClick={copyLink}>
                    {copied ? 'Link copied' : 'Copy link'}
                  </button>
                  <button onClick={restart}>Play again</button>
                  <button
                    onClick={() => {
                      setEnded(false);
                      inputRef.current?.focus();
                    }}
                  >
                    Try another repository
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="transport">
            <button className={`play ${playing ? 'on' : ''}`} onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!!loadingSound}>
              {playing ? (
                <svg viewBox="0 0 24 24" width="22" height="22"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10-6.5a1 1 0 0 0 0-1.72l-10-6.5A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
              )}
            </button>
            <button className="ghost" onClick={restart} aria-label="Restart" title="Restart">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M12 5a7 7 0 1 1-6.6 4.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M5 4v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Progress score={score} getBeat={getBeat} />
            <button className="ghost speed" onClick={toggleSpeed} aria-label="Speed" title="Speed">
              {fast ? '2×' : '1×'}
            </button>
            <span className="hint">
              {loadingSound ?? `about ${Math.round((score.lengthBeats * SECONDS_PER_BEAT * (fast ? 0.5 : 1)) / 5) * 5} s`}
            </span>
          </div>
        </main>
      )}

      <footer className="foot">
        Instruments: VSCO-2 Community Edition (CC0). Commits from the public GitHub API.
      </footer>
    </div>
  );
}
