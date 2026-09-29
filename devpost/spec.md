---
doc: spec
status: approved
---
<!-- Approved by delegation (see scope.md). Technical choices below are the agent's, made on the learner's instruction. -->

# Commit Chorus — Technical Spec

## How This Works, In Plain Language
Commit Chorus is a single web page with no server of its own.
1. **Commit loader** gets a list of commits: from a bundled file for the three presets, or from GitHub's public API for any other repository.
2. **Arranger** turns that list into a score: a deterministic list of notes (when, which instrument, which pitch, how loud), plus the bass line and the soft chord underneath. It is plain code with no randomness, so the same commits always give the same score.
3. **Sound engine** loads short recordings of real instruments and plays the score through the browser's built-in audio system, with a little reverb.
4. **Roll view** draws the paper roll on a canvas and moves it in step with the sound engine's clock.
5. **Page shell** holds the header, presets, transport buttons, ticker and end card.

Why this shape: everything the product needs can run in the browser, so it can be hosted as static files for free and the demo never depends on a backend.

## The Core Journey Through the System
PRD ref: `prd.md > The Core Journey`.
1. Visitor clicks a preset → **Commit loader** fetches `presets/<name>.json` from the page's own files → returns commits in the shared format.
2. Visitor types a repository → **Commit loader** calls GitHub (repository info, then commit pages from the oldest) → same format, or an error.
3. **Arranger** builds the score and summary stats → **Page shell** shows the player; **Roll view** draws lanes and holes.
4. Visitor presses Play → **Sound engine** resumes the audio context (browser rule: only after a click) and schedules notes slightly ahead of time; **Roll view** reads the engine's clock every frame and lights the holes crossing the comb; **Page shell** updates the ticker and progress.
5. At the end → **Page shell** shows the end card built from the Arranger's stats, with a `?repo=` link.

## Stack
- **Vite 7 + TypeScript + React 19** for the page (https://vite.dev, https://react.dev). React for the small amount of UI state; the roll itself is a plain canvas.
- **Web Audio API** for playback (https://developer.mozilla.org/docs/Web/API/Web_Audio_API): `AudioBufferSourceNode` per note, `ConvolverNode` reverb, `DynamicsCompressorNode` on the master.
- **Vitest** for arranger, parser and loader tests (https://vitest.dev).
- **Playwright** (already installed on the build machine) for an in-browser smoke test and an offline audio render check.
- Instrument recordings: **VSCO-2 Community Edition**, CC0 (https://github.com/sgossner/VSCO-2-CE), converted to short mono MP3s.
- Fonts: Fraunces (headings) and JetBrains Mono (commit text) from Google Fonts.

## Where It Runs and How Someone Tries It
- Browser only. Development: `npm install`, then `npm run dev` and open the printed localhost URL.
- Production: `npm run build` produces `dist/`, published to GitHub Pages at `https://luoy16002-svg.github.io/commit-chorus/`.
- No API keys. Live repositories use GitHub's anonymous API (60 requests per hour per visitor IP).
- Preset data is generated once by `npm run presets` (uses `GITHUB_TOKEN` from the environment if present) and committed.
- Demo recording: open the deployed page, play the Deno preset, then type another repository.

## Look and Feel
From `prd.md > Look and Feel`.
- Palette: walnut/ink background `#15110e`, roll surface `#1d1814` with faint paper grain, cream text `#efe6d6`, muted text `#a4978a`, brass `#c9a45c`, bright brass for struck notes `#f3d08a`. Each voice has its own hole tint (warm golds, copper, ivory, rose, sage, teal) so lanes are distinguishable without looking like a chart.
- Fraunces for the title and headings; JetBrains Mono for commit messages, dates and counts; system sans for small UI text.
- Spacious, calm, slow easing. The comb is a vertical brass bar with small teeth; struck holes bloom and fade over about half a second.
- No purple gradients, no glassmorphism, no emoji UI.

## Components

### Commit loader (`src/loader/`)
- `parseRepo(input)` accepts `owner/name` and GitHub URLs (with or without `https://`, `www.`, trailing `/`, `.git`, extra path segments); returns `{owner, name}` or an error.
- `loadPreset(slug)` fetches `presets/<slug>.json`.
- `loadLive(owner, name)`:
  1. `GET https://api.github.com/repos/{owner}/{name}` → 404 means not found.
  2. `GET /repos/{owner}/{name}/commits?per_page=100&page=1` → read `Link` `rel="last"` to find the last page (no Link header → only this page).
  3. Fetch pages from the last one backwards, reversing each page, until 1,000 commits are collected or a commit is more than 365 days after the first commit. Stop at 12 requests total.
  4. Rate limit: status 403 or 429 with `x-ratelimit-remaining: 0` → error with `x-ratelimit-reset` time.
- Returns the shared format (see Data Model). PRD ref: `prd.md > Choosing a repository`.

### Arranger (`src/music/arranger.ts`)
Pure function `arrange(song) → { notes, bass, pads, voices, stats, lengthBeats }`. PRD ref: `prd.md > The music`.
- **Time:** the song starts on the Monday (00:00 UTC) of the first commit's week. `day = floor((commitTime − start) / 1 day)`, `bar = floor(day / 7)`, `beat = day mod 7`. One beat = 0.25 s at normal speed (a full year ≈ 91 s), 0.125 s at double speed.
- **Harmony:** key of C major; the chord changes every bar through C – Am – F – G. Allowed pitches: chord tones on the first note of each day; chord tones plus the C-major pentatonic (C D E G A) for the other notes of a run.
- **Voices:** authors are identified by GitHub login, or by commit author name when there is no login. An author earns a voice on their third commit; the first six to do so get, in order, glockenspiel (MIDI 79–96), harp (60–84), upright piano (55–79), violin pizzicato (62–86), viola pizzicato (55–76) and cello pizzicato (43–64). Bots (`[bot]` logins) and everyone else share "everyone else" (soft piano, 60–84). Before an author earns a voice, their commits play in "everyone else".
- **Melody:** each voice keeps its last pitch. The next pitch moves by a step chosen from the commit hash (−2, −1, +1 or +2 scale steps, favouring ±1), is snapped to the nearest allowed pitch, and turns back at the edges of the range. The first note of a voice starts in the middle of its range.
- **Runs:** at most four notes per voice per day, spread evenly across that day's beat; further commits on the same day add loudness (velocity 0.55 → 0.9) instead of notes. All commits are still drawn on the roll.
- **Bass:** contrabass pizzicato plays the chord root (MIDI 36–47) on beat 0 of every bar and the fifth on beat 4, including bars with no commits.
- **Pad:** a very quiet sustained string triad (viola ensemble) for each bar, fading in and out.
- **Stats:** commits, voices earned, busiest bar (dates and count), longest gap in days, date range.

### Sound engine (`src/audio/engine.ts`)
- Loads `samples/<instrument>/<midi>.mp3` (six to nine recordings per instrument, recorded pitch in the file name). Each note uses the nearest recording, pitch-shifted with `playbackRate = 2^((target − recorded)/12)`.
- Built on any `BaseAudioContext`, so the same code renders offline for testing.
- Scheduler: every 25 ms, schedule events whose start falls within the next 150 ms. Pause suspends the context; restart stops all sources and resets the song position.
- Mix: per-instrument gain → master gain (−3 dB) → gentle compressor → destination, with a reverb send (generated 2.4 s impulse response).
- Exposes `songTime()` (seconds into the song) for the roll.
PRD ref: `prd.md > The music`.

### Roll view (`src/roll/RollCanvas.tsx`)
- Canvas sized to its container with device-pixel-ratio scaling.
- x = comb + (day − playheadDay) × pixelsPerDay (about 14 px); lanes 44 px tall with avatar, name and instrument at the left edge; month labels along the top; weekends shaded.
- Holes for every commit (several on one day sit side by side); a hole lights up when its note time passes, then fades.
- Redraws on `requestAnimationFrame` only while playing or animating.
PRD ref: `prd.md > The roll`.

### Page shell (`src/App.tsx`)
Header with title and repository input; home state with the three preset cards; player with the roll, transport (play/pause, restart, speed), ticker and progress; end card overlay with stats and "Copy link"; error line in the header. Reads `?repo=` on load. PRD ref: `prd.md > Screens and Layout`, `prd.md > End card and sharing`, `prd.md > States and Boundaries`.

## Data Model
In-memory only.
```ts
type Author = { key: string; login: string | null; name: string; avatar: string | null; bot: boolean };
type Commit = { t: number /* ms since epoch, UTC */; a: number /* author index */; sha: string /* 7 chars */; msg: string /* first line, ≤ 90 chars */ };
type Song = { repo: string; source: 'preset' | 'live'; window: { from: string; to: string; capped: boolean }; authors: Author[]; commits: Commit[] /* oldest first */ };
```
Preset files store the same `Song` as JSON. Nothing is saved between visits; the URL `?repo=owner/name` is the only shared state.

## File Structure
```
commit-chorus/
├── public/
│   ├── presets/            # deno.json, vite.json, bun.json (generated, committed)
│   └── samples/            # <instrument>/<midi>.mp3, CC0 VSCO-2 CE + LICENSE
├── scripts/
│   ├── make-presets.mjs    # fetches first-year commits for the presets
│   └── make-samples.py     # cuts and encodes instrument recordings
├── src/
│   ├── loader/             # parseRepo, loadPreset, loadLive
│   ├── music/arranger.ts   # commits → score + stats
│   ├── audio/engine.ts     # samples, scheduler, mix
│   ├── roll/RollCanvas.tsx # paper roll
│   ├── App.tsx, main.tsx, styles.css
├── tests/                  # vitest unit tests, playwright smoke test
├── devpost/                # Devpost learning workspace
└── README.md
```

## External Services and Dependencies
- **GitHub REST API** (https://docs.github.com/rest/commits/commits): `GET /repos/{o}/{r}`, `GET /repos/{o}/{r}/commits?per_page=100&page=N`. No key. 60 requests/hour/IP anonymous; responses include `Link` and `x-ratelimit-*` headers exposed to browsers. Free.
- **GitHub avatars** (`avatars.githubusercontent.com`) loaded as images; initials if missing. Free.
- **Google Fonts**. Free.
- **GitHub Pages** for hosting. Free.

## Important Failure Modes
- **Anonymous rate limit reached** → header message with the reset time and a pointer to the presets; the loaded song keeps playing.
- **Audio blocked until a click / context suspended** → playback only starts from the Play button; if the context is suspended, the button resumes it.
- **Very dense repositories** → runs are capped at four notes per voice per day and live fetches at 1,000 commits, so the mix stays clear and the fetch stays within a dozen requests.

## What Was Simplified and Why
- **Fixed chord progression** instead of harmony derived from the data — guarantees the music stays consonant, which the learner cares about. A data-driven harmony would need much more musical design.
- **First year only** instead of any range — enough to tell the story of a project's start; a range picker is a small later addition.
- **Commit counts, not diff sizes, drive loudness** — sizes need one request per commit.

## Decisions and Open Issues
- All choices here were made by the agent on the learner's instruction; the learner chose the idea.
- Genuine uncertainty: whether six sampled instruments plus bass and pad sound clear rather than cluttered at dense moments. Resolved during the build by rendering Deno's busiest weeks offline and listening; the fallbacks are lowering the "everyone else" voice and dropping the pad.
- Open: none blocking.
