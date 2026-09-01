# SAVS WebMCP — Demonstration Script

Status: production script retained for the accepted 157.12-second public demo. Maximum allowed video length: under 3 minutes.

The final recording must use the stable live URL, English audio, and no unlicensed music, marks, or third-party material.

## Recording prerequisites

- Use the final hosted build, not the local proof report.
- Start from a clean judge session at R0.
- Confirm the page displays `4 WebMCP tools available`.
- Keep the WebMCP tool activity and product UI visible where practical.
- Record at 1280 × 720 or higher with browser zoom at 100%.
- Prepare unique idempotency and audit IDs for the recording.
- Do one rehearsal, then reset to R0 before the final take.

## Shot list and narration

### 0:00–0:15 — The completion gap

Visual:

- Open on the product hero: `The action passed. The pixels still have to.`
- Show the status line with four WebMCP tools available.

Narration:

> A browser tool can report that an action succeeded while the interface a person sees is still wrong. SAVS WebMCP adds a second completion boundary: visual evidence tied to the exact UI revision it inspected.

### 0:15–0:32 — One shared page

Visual:

- Briefly show the human controls and the WebMCP tool list.
- Call `get_visual_state` and point to R0.

Narration:

> The person and agent share one live page and one application state machine. Four typed WebMCP tools let the agent read state, apply a compact layout, run a visual audit, and apply one allowlisted repair. We begin at approved revision R0.

### 0:32–0:52 — Structured success creates R1

Visual:

- Call `apply_compact_layout` with a unique idempotency key.
- Show the tool receipt and the revision trace advancing from R0 to R1.
- Hold on the two metrics long enough to see the numerals sitting low relative to their units.

Narration:

> The compact-layout action succeeds and creates immutable revision R1. Application state is valid, but the numerals are now shifted down by two CSS pixels. The API success did not prove a correct visible result.

### 0:52–1:20 — Independent audit returns BLOCK

Visual:

- Call `run_visual_audit` for R1.
- Show BLOCK, the approved reference, current raster, and exact difference mask.
- Point to `1,528 px`, `2 / 2` targets, `0 px` outside targets, and `0 px` stable control.
- Optionally use Blink Compare once.

Narration:

> The audit independently rerenders the approved reference and R1 in a controlled browser. Exact pixel comparison finds 1,528 changed pixels, all inside two registered targets, while the repeated-reference control stays at zero. R1 is fresh, so the visual verdict is BLOCK.

### 1:20–1:43 — Repair creates R2 and invalidates old evidence

Visual:

- Call `apply_alignment_repair` with `expectedRevisionId` set to R1.
- Show the revision trace advancing to R2 while the visible evidence revision still says R1.
- Emphasize `STALE` and BLOCK.

Narration:

> The agent applies the single allowlisted alignment repair and creates R2. But the old R1 audit does not become a PASS. It is now stale, because evidence for one revision cannot certify its successor.

### 1:43–2:05 — Fresh R2 evidence earns PASS

Visual:

- Call `run_visual_audit` for R2.
- Show PASS, zero changed pixels, zero outside targets, and fresh R2 evidence.
- Show the repaired metrics aligned with their units.

Narration:

> The agent must inspect again. A fresh R2 audit finds zero changed pixels and returns PASS. The workflow ends only when the structured action, the visible result, and the evidence revision all agree.

### 2:05–2:30 — Why it matters

Visual:

- Return to the full product view.
- End on the R0 → R1 → BLOCK → STALE → R2 → PASS chronology.

Narration:

> This pattern applies anywhere agents change a visual product: dashboards, editors, forms, documents, and design systems. WebMCP makes the application operable. Revision-bound visual verification makes the agent's completion claim inspectable and trustworthy.

## Recording claim boundary

The final video may claim only what the recorded build visibly proves. In particular:

- Say `WebMCP-enabled Chrome` if that is the recorded boundary.
- Say `ChatGPT in-app browser` only after a separately observed run on that boundary.
- Use the measurement values from the final live receipt, not automatically the current local values.
- Do not call the repository public, licensed, hosted, or submitted until each state is true.

## Final video checklist

- Duration is below 3:00.
- English narration is audible and synchronized.
- The project functions as described.
- WebMCP usage is visible and explained.
- R1 BLOCK, stale rejection, and fresh R2 PASS are all shown.
- No private repository path, credential, personal notification, or unrelated browser tab is visible.
- No unlicensed music or third-party marks appear.
- YouTube visibility is public before the Devpost link is entered.
