/**
 * Fetch the first year of the preset repositories and save them to public/presets/.
 * Run with a token to avoid the anonymous limit:  GITHUB_TOKEN=$(gh auth token) npm run presets
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { loadRepo } from '../src/loader/github';

const PRESETS: Record<string, string> = { deno: 'denoland/deno', vite: 'vitejs/vite', bun: 'oven-sh/bun' };

const token = process.env.GITHUB_TOKEN;
await mkdir('public/presets', { recursive: true });
for (const [slug, full] of Object.entries(PRESETS)) {
  const [owner, name] = full.split('/');
  const song = await loadRepo({ owner, name }, { maxCommits: Infinity, maxRequests: 60, token });
  song.source = 'preset';
  await writeFile(`public/presets/${slug}.json`, JSON.stringify(song));
  console.log(`${slug}: ${song.commits.length} commits, ${song.authors.length} authors, ${song.window.from.slice(0, 10)} → ${song.window.to.slice(0, 10)}`);
}
