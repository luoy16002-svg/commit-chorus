---
doc: prd
status: approved
---
<!-- Approved by delegation (see scope.md). Product decisions below were made by the agent
     on the learner's instruction and are labelled as such. -->

# Commit Chorus — Product Requirements

A web page where a developer picks or types a public GitHub repository and hears its first year played as a music box, with a scrolling paper-roll view of who committed when.
Source: `scope.md > The Unique Kernel`, `scope.md > The Core Loop`.

## The Core Journey
1. The visitor lands on a dark "open music box" page: the title, one line of explanation, a repository input, and three preset cards (Deno, Vite, Bun — "first year").
2. They click a preset (or type `owner/name` or a GitHub URL and press Enter).
3. A short loading state shows what is being fetched ("Reading 1,000 commits…"). Presets load instantly.
4. The roll appears: one lane per voice, each with the contributor's avatar and name, commits drawn as punched holes along a timeline with month labels. A "Play" button is highlighted. (Browsers need a click before sound, so playback always starts from a click.)
5. They press Play. The roll scrolls right-to-left under a fixed brass comb. Each hole lights up and sounds as it crosses the comb. A ticker under the roll shows the latest commit message, author and date. A progress bar shows the month.
6. They can pause, resume, restart, and switch speed (normal ≈ 90 seconds for a full year, or double speed).
7. When the song ends, an end card shows: commits, voices, the busiest week, the longest silence, and a "Copy link" button whose URL replays this repository for anyone.
8. They try another repository from the input at the top.

## Screens and Layout
One page, three states: **Home** (input + presets), **Player** (roll + transport + ticker), **End card** (overlay on the player). The input stays in the header in every state.

## Look and Feel
(Agent decision on the learner's behalf, following `scope.md > Inspiration & Identity`.)
- Inside of a music box: deep walnut/ink background, a velvet-dark roll surface, brass/gold accents for the comb and active notes, warm paper-cream text.
- Typography: an elegant serif for the title and headings (Fraunces or similar), a clean monospace for commit messages and dates.
- Motion is smooth and slow; holes glow softly when struck. No dashboard chrome, no charts.
- Avoid generic purple-gradient "AI app" styling.

## Features and Behavior

### Choosing a repository
- Presets play Deno, Vite and Bun from bundled data, never touching the network for commits.
- The input accepts `owner/name`, `https://github.com/owner/name`, with or without trailing slashes or `.git`.
- Live repositories use the first year of the default branch, or the first 1,000 commits if that comes sooner; the header says which ("first 1,000 commits · May–Dec 2018").
- [ ] Typing `denoland/deno` or its URL plays the same song as the Deno preset's opening (same notes for the same commits).
- [ ] An unknown repository shows "Couldn't find that repository" and keeps the previous song loaded.
- [ ] When GitHub's anonymous limit is reached, the page says so plainly with the reset time and suggests the presets.
- [ ] An empty repository shows "No commits to play yet."

### The music
(Agent decisions, made to satisfy the learner's "clear harmony, not chaotic" requirement.)
- One day = one beat; one week = one bar of seven beats; the chord changes every week through a four-week cycle, so the harmony always resolves.
- A contributor earns their own instrument once they reach a few commits: 3 in a small repository, 6 in one with 100–299 commits in the window, 10 in a busy one (300+). The first six to do so get glockenspiel, harp, upright piano, violin pizzicato, viola pizzicato and cello pizzicato, in that order; everyone else shares a soft piano voice. Every busy song uses the same threshold, so a live fetch capped at 1,000 commits assigns the same instruments as the full year.
- Each contributor's notes move stepwise from their previous note, so every voice sounds like a line, not random notes. Busy days become quick runs (up to four notes per voice per day); a louder day means more commits.
- A pizzicato bass marks each week's first beat and a very quiet sustained string chord holds the harmony, so quiet weeks still sound like music, and silence in the commit history is heard as thinning texture, not dead air.
- The same repository always produces exactly the same song.
- [ ] Playing the same preset twice produces identical note events.
- [ ] No two notes sound outside the current week's chord or scale.
- [ ] Overall level never clips (peak below 0 dBFS) and a normal passage is comfortably audible.

### The roll
- One lane per voice, top-to-bottom in the order voices were earned, plus an "everyone else" lane; each lane shows the avatar, name and instrument. A lane appears the moment its contributor earns it.
- Holes are placed by date; month labels along the top; weekends are faintly shaded.
- The comb sits at about one third from the left; holes glow as they pass it, in sync with the sound (within about 50 ms).
- The ticker shows the most recent commit's first line (truncated), author and date.
- [ ] With the Deno preset, the first weeks show one lane (Ryan Dahl) and new lanes appear as contributors join.
- [ ] Pausing freezes both sound and roll; resuming continues from the same beat.

### End card and sharing
- Stats: commits played, number of voices, busiest week (dates and count), longest gap without commits.
- "Copy link" copies a URL like `…/?repo=denoland/deno` that loads that repository directly.
- [ ] Opening a copied link shows the player for that repository with the Play button ready.

## States and Boundaries
- **First visit** — home state with presets; nothing plays until a click.
- **Loading** — progress text while commits are fetched; input disabled.
- **Error** — not found, rate limited, network failure, or empty repository: a one-line message in the header; the previous song stays playable.
- **Nothing persists** between visits except what is in the URL.

## Product Decisions
- Presets are bundled so the demo and first impression never depend on GitHub's anonymous limit (agent decision).
- First year, capped at 1,000 commits for live repositories: keeps a song around 90 seconds and the fetch within about a dozen anonymous requests (agent decision).
- Sound starts only on a user click, as browsers require.

## What We're Building
The three states above, the deterministic arrangement, sampled playback, the roll and ticker, live fetching with the listed errors, the end card and share link, and deployment as a static page.

## Deferred From the POC
- Audio/video export — needs offline rendering and encoding; not required to prove the kernel.
- Year or range picker — the first year already shows the story of a project's start.
- Signed-in fetching — would lift the rate limit but needs OAuth.

## Possible Later Enhancements
Instrument boxes (all piano, all strings); a "compare two repos" duet; embedding a small player in a README.

## Non-Goals
- Private repositories or tokens.
- Accurate analytics; this is a playful view, not a metrics tool.
- AI-generated music.

## Open Questions
None blocking. Which exact instruments sound best together is settled during the build by listening tests.
