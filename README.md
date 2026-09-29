# Commit Chorus

Hear the first year of any GitHub repository, played as a music box.

**Try it:** https://luoy16002-svg.github.io/commit-chorus/ — pick Deno, Vite or Bun, or type any public repository.

Every commit is a note. Every week is a bar, and quiet weekends are rests. Regular contributors earn their own instrument, so you can hear new people arrive: Deno's first year opens with Ryan Dahl alone on glockenspiel, then Bert Belder's harp joins, then Kitson Kelly's pizzicato violin. Bun's first year is almost entirely Jarred Sumner.

## How history becomes music

| History | Music |
|---|---|
| One day | One beat (a quarter of a second; a full year plays in about 90 seconds) |
| One week | One bar of seven beats, Monday first |
| The chord | Changes every week through C – Am – F – G, so the harmony always resolves |
| A commit | A note on its author's instrument, on the day it was written |
| A busy day | A quick run of up to four notes; more commits make it louder |
| A contributor | Earns an instrument once they reach a few commits (3 in a small repository, 6 in a mid-sized one, 10 in a busy one). The first six get glockenspiel, harp, upright piano, violin, viola and cello pizzicato; everyone else shares a soft piano |
| Each voice's melody | Moves stepwise from its previous note; the commit hash picks the step, so the line wanders but never jumps randomly |
| Quiet weeks | The double bass and a soft string chord keep playing, so silence in the history sounds like thinning texture rather than dead air |

Nothing is random: the same commits always produce the same song. Every melodic note belongs to the week's chord (first note of a day) or to the chord plus the C-major pentatonic scale.

## Running it

```bash
npm install
npm run dev          # open the printed localhost URL
npm test             # arranger and loader unit tests
npm run build        # static site in dist/
```

Live repositories use GitHub's anonymous API (60 requests per hour per visitor). A repository takes about a dozen requests: the first year, or the first 1,000 commits if that comes sooner. The three presets are bundled, so they always play.

Regenerate the presets with `GITHUB_TOKEN=$(gh auth token) npm run presets`, and the instrument samples with `python scripts/make-samples.py` (needs a local copy of VSCO-2 CE).

## How it's built

- `src/loader/` reads a repository's oldest commits page by page from the GitHub REST API.
- `src/music/arranger.ts` turns commits into a score: a pure, deterministic function.
- `src/audio/engine.ts` plays the score with the Web Audio API: sampled instruments, look-ahead scheduling, a generated reverb and a gentle compressor. The same code renders offline for the level checks in `tests/e2e/`.
- `src/roll/RollCanvas.tsx` draws the paper roll on a canvas, following the heard position (the audio clock minus the device's output latency).

This project was planned and built with the [Devpost Learn "Build With AI: Basics"](https://learn-ai-basics.devpost.com/) skill pack. The planning documents are in [`devpost/`](devpost/): scope, product requirements, technical spec and the build checklist with every revision the build forced.

## Credits

- Instrument recordings: [Versilian Studios Chamber Orchestra 2, Community Edition](https://github.com/sgossner/VSCO-2-CE) (CC0), trimmed and re-encoded.
- Fonts: Fraunces and JetBrains Mono (SIL Open Font License), via Google Fonts.
- Commit data and avatars: the public GitHub API.

Code: MIT licence.
