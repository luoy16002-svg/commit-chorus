---
doc: scope
status: approved
---
<!-- Approved by delegation: the learner chose this idea from a shortlist and asked the agent to
     make the remaining decisions and carry the work through ("继续直到完成所有任务再汇报"). -->

# Commit Chorus

Type a public GitHub repository and hear its first year played as a music box.

## The Unique Kernel
A repository's real history becomes a piece of music that is recognisably *that* repository's and still sounds like music: every commit is a note, every contributor is a voice, every week is a bar, and quiet weekends are audible rests. The same repository always plays the same song.

## Who It's For
A developer who maintains or loves an open-source project and wants a playful, shareable way to see and hear how it grew: who showed up when, where the crunch weeks were, when the project went quiet. Today they look at the GitHub contributor graph, which is accurate and forgettable.

## The Core Loop
They open the page, pick a famous repository or type their own, press play, and watch a music-box paper roll scroll past the playhead while the repository's first year plays in about a minute and a half. Commit messages tick by as their notes sound. At the end they get a short summary and a link that plays the same song for anyone they send it to. They come back to try another repository, usually their own.

## Inspiration & Identity
A mechanical music box: brass comb, punched paper roll, the lid of a dark wooden box. Warm, a little magical, never techy dashboards. The music must have clear harmony and a steady pulse (the learner dislikes procedural music that sounds chaotic), so the arrangement is built on a fixed chord progression and real acoustic instrument samples (CC0 VSCO-2 recordings: glockenspiel, harp, upright piano, pizzicato strings).

## Why This Matters to the Learner
They wanted something fun, not a generic AI app and not a crowded category. A search found only a few one-star experiments that turn git history into sound; nobody has made it a polished, shareable thing.

## What "Working" Looks Like
Choose "Deno, first year" and press play: a roll of glowing holes scrolls under a brass comb, one lane per contributor with their avatar, Ryan Dahl's glockenspiel carrying most of the early weeks, new voices joining as contributors arrive, commit messages ticking under the roll, and the whole thing sounding like a gentle, coherent piece. Then type any other public repository and it plays its own, different song. The "oh, that's cool" beat: hearing the week a flood of new contributors arrived.

## The POC Boundary
- Public GitHub repositories, the first year of history on the default branch (capped at the first 1,000 commits).
- A fixed musical mapping: week = bar in 7/8 (one beat per day), a four-week chord cycle, up to six named voices plus "everyone else", a bass line and a soft pad.
- The music-box roll visual with lanes, avatars, playhead and commit ticker.
- Three bundled presets so the demo never depends on GitHub's rate limit.
- Play, pause, restart, speed, and an end card with stats and a share link.

## Later
- Choose a different year or a date range.
- Export the song as audio or video.
- Different "instruments boxes" (piano only, strings only).
- Sign in with GitHub to lift the anonymous rate limit.

## Explicitly Cut
- Private repositories and tokens: would need the learner's users to hand over credentials; not needed to prove the kernel.
- Per-commit diff size as note loudness: needs one extra API request per commit, far past the anonymous rate limit.
- Local-time "night owl" markers: the public API reports commit times in UTC, so they would be wrong.
- Any AI-generated music or text: the point is that the history itself is the score.
