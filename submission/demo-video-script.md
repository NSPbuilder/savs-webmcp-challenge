# Demo video script and storyboard

> Production status (2026-09-01): this storyboard produced the exact v4 export
> accepted at H2. It is retained for traceability. The official rules require
> the project to function as depicted, but do not require the video itself to
> be captured from the hosted origin. The accepted local native-WebMCP video
> and the separately verified public Render behavior satisfy those two
> evidence boundaries independently.

- Declared spoken runtime: **02:36**
- Recording hard stop: **02:45**
- Rule limit: **03:00**
- Contingency margin: **00:15**
- Language: English
- Audio: spoken narration; no music required
- Recording source: local native-WebMCP capture, separately bound to the
  verified public Render behavior

The recording must show real WebMCP discovery and invocation, not a simulated
overlay. Use ChatGPT's in-app browser if available for the final recording. The
documented fallback is Chrome 149 or later after enabling
`chrome://flags/#enable-webmcp-testing` and restarting.

## 00:00–00:12 — Hook

**Screen:** Open on R0, zoom briefly toward the aligned metric strip, then show
the revision and audit panels.

**Narration:**

> A browser agent can execute the right tool and still leave a page that looks
> wrong. SAVS gives WebMCP agents a visual result contract, not just an action
> receipt.

## 00:12–00:29 — Discover the tools

**Screen:** Show the page status “4 WebMCP tools available,” then the agent's
discovered tool list.

**Narration:**

> This page registers four native WebMCP tools: read visual state, apply a
> compact layout, audit an exact revision, and apply one constrained repair.
> The person and agent share the same visible workbench.

## 00:29–00:50 — A successful action creates R1

**Screen:** Invoke `get_visual_state`, then `apply_compact_layout` with a unique
idempotency key. Hold on the successful R1 receipt and the now-misaligned
numeric baseline.

**Narration:**

> We begin at approved reference R0. The compact-layout tool succeeds and
> returns immutable revision R1. Operationally, the action worked. Visually,
> the large numbers have dropped against their text.

## 00:50–01:16 — Fresh R1 is blocked

**Screen:** Invoke `run_visual_audit` for R1. Show the `BLOCK` verdict and the
reference, current, and diff evidence. Point to the target-only difference;
do not narrate a fixed pixel count unless the live run displays it.

**Narration:**

> SAVS rerenders the approved reference and R1, then compares exact pixels. The
> fresh result is BLOCK. The difference is non-zero inside the allowed target,
> while the protected control region stays unchanged. A successful tool call
> is not allowed to approve a visibly wrong revision.

## 01:16–01:39 — Repair creates R2

**Screen:** Invoke `apply_alignment_repair` with `expectedRevisionId` R1. Show
the R2 receipt and restored alignment.

**Narration:**

> The repair tool accepts the expected revision and changes only the allowlisted
> baseline alignment. It does not overwrite R1. It creates successor R2, so the
> revision history remains inspectable.

## 01:39–01:58 — Old evidence cannot approve new state

**Screen:** Select or invoke the R1 audit after R2 is current. Show freshness
`stale` and verdict `BLOCK`.

**Narration:**

> Now the R1 evidence is stale. Even if old evidence had looked good, it could
> not approve the current page. Visual truth belongs to an exact revision, not
> whatever happens to be latest.

## 01:58–02:20 — Fresh R2 passes

**Screen:** Invoke `run_visual_audit` for R2. Show `PASS`, freshness `fresh`,
and zero changed pixels. Return to the aligned metric strip.

**Narration:**

> A fresh audit of R2 returns PASS with zero changed pixels. The agent has a
> structured verdict, and the person can see the same evidence and repaired
> result.

## 02:20–02:36 — Why it matters

**Screen:** Show the four tools, R0–R2 timeline, and final PASS together. End on
the title “A successful tool call is not a visual verdict.”

**Narration:**

> WebMCP makes website actions explicit. SAVS makes their human-visible results
> verifiable. Together they let people and agents change a page, catch a subtle
> defect, repair it, and prove the exact result they are approving.

## Recording acceptance

- The final exported video is shorter than 03:00 and targets at most 02:45.
- Every narrated state is visible and readable on screen.
- The recording depicts the same R0→R1→R2 behavior independently verified at
  the public Render origin.
- The tool list is discovered from the page during the take.
- The R1 and R2 verdicts are produced live; no verdict is edited into the video.
- No exact R1 changed-pixel count is spoken unless it matches that live take.
- Audio is intelligible; there is no unlicensed music, trademark montage, or
  third-party footage.
- The final upload is public on YouTube at
  https://youtu.be/quJI1JD3FzE.
