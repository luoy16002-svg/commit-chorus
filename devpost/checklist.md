---
doc: checklist
status: approved
---
<!-- Approved by delegation (see scope.md). -->

# Build Checklist

Build mode: fast (the learner asked the agent to carry the build through and report at the end)

## Slices

- [x] **1. The Deno preset plays as music**
  Becomes usable: A running page with a "Deno — first year" button and Play/Pause; pressing Play sounds Deno's first year through the sampled instruments, with a progress bar.
  Why now: The kernel and the biggest risk (does the history really sound like music?) come first; the scaffold, preset data, samples, arranger and engine all land here.
  PRD ref: `prd.md > The Core Journey` (steps 2, 5), `prd.md > The music`
  Spec ref: `spec.md > Arranger (src/music/arranger.ts)`, `spec.md > Sound engine (src/audio/engine.ts)`, `spec.md > Data Model`, `spec.md > File Structure`
  Build: Scaffold Vite + React + TypeScript; write `scripts/make-samples.py` and `scripts/make-presets.mjs` and generate the samples and three presets; implement the arranger and the sound engine; a minimal page with the preset button, Play/Pause and progress.
  Verify (mechanical): `npm test` (arranger determinism, chord/scale conformance, third-commit voice rule, run cap); `npx tsc --noEmit`; a Playwright script renders the first 30 s of Deno offline and reports peak below 0 dBFS and RMS above −30 dBFS, then plays it live with no console errors; listen to an exported WAV of the densest weeks.
  Learner check: Open the page, press Play on Deno, and listen for a steady, pleasant music-box piece rather than random notes.
  Commit: `Play the Deno preset as a music box`

- [ ] **2. The paper roll moves with the music**
  Becomes usable: Lanes with avatars and instruments, holes for every commit, month labels, a brass comb where holes light up in time with their notes, and the commit ticker.
  Why now: Sight plus sound is what makes the kernel readable; it depends only on slice 1's score and clock.
  PRD ref: `prd.md > The roll`, `prd.md > The Core Journey` (steps 4–5)
  Spec ref: `spec.md > Roll view (src/roll/RollCanvas.tsx)`, `spec.md > Look and Feel`
  Build: Canvas roll with lanes, holes, comb, glow, month labels and weekend shading driven by `songTime()`; ticker; apply the palette and fonts.
  Verify (mechanical): Playwright screenshots at 0 s, 10 s and 40 s of playback show the roll advancing and lit holes at the comb; an in-page check compares the lit-hole time with the engine clock (≤ 50 ms apart).
  Learner check: Watch the Deno preset for half a minute and say whether the roll and the sound feel in sync.
  Commit: `Draw the paper roll in sync with playback`

- [ ] **3. Any public repository plays**
  Becomes usable: Type `owner/name` or a GitHub URL and hear that repository's first year; clear messages for not found, rate limited, empty and network errors.
  Why now: Turns the demo into a tool; it reuses the arranger, engine and roll unchanged.
  PRD ref: `prd.md > Choosing a repository`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > Commit loader (src/loader/)`, `spec.md > External Services and Dependencies`, `spec.md > Important Failure Modes`
  Build: `parseRepo`, `loadLive` with backward pagination, the 1,000-commit / 365-day cap and error mapping; loading state; header input.
  Verify (mechanical): Unit tests for `parseRepo` and `loadLive` with mocked responses (pagination, cap, 404, rate limit, empty); a live check that `denoland/deno` produces the same opening notes as the preset.
  Learner check: Type a repository you know and see whether its song and lanes match what you'd expect.
  Commit: `Play any public repository from GitHub`

- [ ] **4. End card, sharing and transport**
  Becomes usable: Restart and double speed; an end card with commits, voices, busiest week and longest gap; "Copy link" with `?repo=` that opens straight into the player.
  Why now: Completes the journey the PRD describes and makes it shareable.
  PRD ref: `prd.md > End card and sharing`, `prd.md > The Core Journey` (steps 6–8)
  Spec ref: `spec.md > Page shell (src/App.tsx)`, `spec.md > Arranger (src/music/arranger.ts)` (stats)
  Build: Transport controls, stats end card, share link, reading `?repo=` on load, home state polish.
  Verify (mechanical): Unit test for stats; Playwright: open `?repo=` for a preset, play at double speed to the end, assert the end card and the copied URL.
  Learner check: Play a preset to the end, copy the link, and open it in a new tab.
  Commit: `Add end card, share link and transport`

- [ ] **5. Published**
  Becomes usable: The app is live on GitHub Pages and the public repository has a README.
  Why now: The submission needs a public repository; a live link makes the demo easy to try.
  PRD ref: `prd.md > What We're Building`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`
  Build: Base path for Pages, production build, README (what, how it maps music, credits and licences), publish.
  Verify (mechanical): `npm run build` succeeds; the Pages URL loads, the Deno preset plays with no console errors in Playwright.
  Learner check: Open the public link on your own device and play a preset.
  Commit: `Prepare for GitHub Pages and write README`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after slice 2 (agent listening test on the learner's behalf, per their delegation)
- [ ] Final kick-the-tires exploration and feedback completed

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — guided route, focused alternative, prior practice connected, or brief recap
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: not started
Route and stops: not started
Edit outcome: not started
Reflection: not started
Activity mode: not started

## Revisions
- Stack versions are Vite 8, TypeScript 7, Vitest 5 and React 19 — the current releases at build time; the spec named Vite 7.
- The "listen to the densest weeks" check became a measured one: the agent cannot listen, so each instrument was rendered alone and its level compared (cello and "everyone else" turned down, the string pad turned up), and the renders are saved for the learner to hear.
