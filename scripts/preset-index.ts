/** Summarise the bundled presets into public/presets/index.json for the home page cards. */
import { readFile, writeFile } from 'node:fs/promises';
import { arrange, INSTRUMENT_LABEL } from '../src/music/arranger';
import type { Song } from '../src/types';

const SLUGS = ['deno', 'vite', 'bun'];
const index = [];
for (const slug of SLUGS) {
  const song = JSON.parse(await readFile(`public/presets/${slug}.json`, 'utf8')) as Song;
  const score = arrange(song);
  const lead = score.voices[0];
  index.push({
    slug,
    repo: song.repo,
    from: song.window.from,
    to: song.window.to,
    commits: song.commits.length,
    authors: song.authors.length,
    voices: score.voices.length - 1,
    lead: lead.author === null ? null : { name: song.authors[lead.author].name, instrument: INSTRUMENT_LABEL[lead.id] },
  });
}
await writeFile('public/presets/index.json', JSON.stringify(index, null, 1));
console.log(index);
