# Voiceover brief — SAVS × WebMCP demo

## What this video is about

This is a 2 minute 36 second product demonstration for the WebMCP Challenge.
It shows why an AI agent completing the correct website action is not enough:
the resulting page can still look visibly wrong to a person.

In the demo, a browser agent uses four native WebMCP tools to inspect a page,
apply a compact layout, run a visual audit, and make one constrained repair.
The layout action succeeds technically, but it creates a subtle optical defect:
two large numbers sit too low beside their text. SAVS detects the visual
difference and blocks that exact revision. The agent then creates a repaired
successor revision. SAVS rejects the old audit as stale and approves the new
revision only after a fresh audit shows that it matches the reference.

The central idea is:

> WebMCP gives agents explicit actions. SAVS verifies the human-visible result.

Or, more simply:

> A successful action is not a visual verdict.

## Tone and delivery

Use a calm, confident, precise, and explanatory tone. This should sound like a
credible technical demonstration, not a dramatic advertisement. Let the key
contrasts land clearly:

- the action **worked**, but the page looked **wrong**;
- the first revision is **blocked**;
- old evidence becomes **stale**;
- the repaired revision receives a fresh **pass**.

Do not rush the technical terms. Brief natural pauses between sentences are
welcome. No music is required. The narration is divided into eight sections so
each section can be recorded separately and aligned to the corresponding
visual scene.

## Pronunciation and terminology

- **WebMCP:** “web M-C-P”
- **SAVS:** “savs,” as one word
- **R0 / R1 / R2:** “R zero,” “R one,” and “R two”
- **BLOCK / PASS:** read as normal English words, with slight emphasis
- **allowlisted:** permitted in advance by a narrowly defined rule
- **stale evidence:** evidence that belongs to an older page revision

The current picture is a silent local rehearsal. The story and narration are
the approved working basis, while the final hosted capture and audio mix will
be completed later.

## Recording references

- Use `video-rehearsal/output/local-rehearsal-v1/narration-draft.srt` for the
  current scene timing.
- Use `submission/demo-video-script.md` as the readable narration and visual
  storyboard.
- Record the eight narration sections as separate takes when possible.
