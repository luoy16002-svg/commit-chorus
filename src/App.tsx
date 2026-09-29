import { useEffect, useRef, useState } from 'react';
import { Engine, loadManifest, type Manifest } from './audio/engine';
import { renderOffline } from './debug';
import { arrange, type Score } from './music/arranger';
import type { Song } from './types';

const BASE = import.meta.env.BASE_URL;

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(0);

  async function ensureEngine(): Promise<Engine> {
    if (engineRef.current) return engineRef.current;
    const manifest = manifestRef.current ?? (manifestRef.current = await loadManifest(BASE));
    const engine = new Engine(new AudioContext(), manifest, BASE);
    await engine.load();
    engineRef.current = engine;
    return engine;
  }

  async function openPreset(slug: string) {
    const s = (await (await fetch(`${BASE}presets/${slug}.json`)).json()) as Song;
    const sc = arrange(s);
    setSong(s);
    setScore(sc);
    engineRef.current?.setScore(sc.notes);
    setPlaying(false);
    setBeat(0);
  }

  async function toggle() {
    if (!score) return;
    const engine = await ensureEngine();
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
    } else {
      if (engine.beat() === 0) engine.setScore(score.notes);
      await engine.play();
      setPlaying(true);
    }
  }

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const b = engineRef.current?.beat() ?? 0;
      setBeat(b);
      if (score && b >= score.lengthBeats + 4) {
        engineRef.current?.pause();
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, score]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__cc = {
      render: async (slug: string, seconds: number, fromBeat = 0, only?: string[]) => {
        const s = (await (await fetch(`${BASE}presets/${slug}.json`)).json()) as Song;
        const manifest = manifestRef.current ?? (manifestRef.current = await loadManifest(BASE));
        return renderOffline(s, manifest, BASE, seconds, fromBeat, only);
      },
      beat: () => engineRef.current?.beat() ?? 0,
    };
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Commit Chorus</h1>
      <button onClick={() => openPreset('deno')}>Deno — first year</button>
      {song && score && (
        <section>
          <p>
            {song.repo}: {score.stats.commits} commits · {score.voices.length - 1} voices
          </p>
          <button onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
          <progress max={score.lengthBeats} value={beat} style={{ width: 400 }} />
        </section>
      )}
    </main>
  );
}
