# Evidence and claims ledger

This ledger separates what the implementation, public Render origin, and
H2-accepted video prove from what must still be proven at the remaining public
submission boundaries.

## Immutable implementation claims

| Claim ID | Permitted claim | Authority |
| --- | --- | --- |
| C1 | The page registers four WebMCP tools. | `app/app.js`, `registerWebMcp()` |
| C2 | Tool names are `get_visual_state`, `apply_compact_layout`, `run_visual_audit`, and `apply_alignment_repair`. | `app/app.js`; `scripts/test-webmcp-compatibility.mjs` |
| C3 | Native Chrome testing discovers and invokes tools through `document.modelContext.getTools` and `executeTool`. | `scripts/test-webmcp-compatibility.mjs` |
| C4 | A successful compact action creates immutable R1; repair creates R2 with an expected-revision precondition. | `app/app.js`; server/store tests |
| C5 | R1 is visually blocked, stale R1 evidence remains blocked after R2 exists, and a fresh R2 audit passes. | independent-origin verification and exact Gate 0 receipt |
| C6 | Visible controls remain available when WebMCP is unavailable. | `app/app.js` |
| C7 | Sessions are distinct and reset-isolated in the Gate 0 proof. | Gate 0 receipt `verification.sessionsDistinct` and `resetIsolation` |

## Exact Gate 0 evidence

- Commit:
  `fdc78a1c3a083e1fc7557b3375b82a0b964617d1`
- GitHub Actions run: `33328327422`
- Runner: GitHub-hosted Ubuntu 24, Linux amd64
- Downloaded receipt:
  `.nsp/execution-integrity/v1/tasks/webmcp-gate0/revisions/rev-007/attempts/attempt-002/downloaded-artifact/receipt.json`
- Receipt SHA-256:
  `42035e9907298a3c2fe401cf0a37f18990461bcc8705dc4339a870c39ee2aa91`
- Terminal bounded audit:
  `.nsp/execution-integrity/v1/tasks/webmcp-gate0/revisions/rev-007/bounded-completion-audit.md`

The receipt records:

| State | Freshness | Verdict | Changed pixels | Outside target | Stable control |
| --- | --- | --- | ---: | ---: | ---: |
| R1 | fresh | BLOCK | 1,667 | 0 | 0 |
| R1 after R2 | stale | BLOCK | environment evidence retained | not an approval path | not an approval path |
| R2 | fresh | PASS | 0 | 0 | 0 |

The same receipt records a 2,271 ms cold start, 397,017,088-byte peak memory,
successful stop and cleanup, and zero residual container IDs. These engineering
figures are supporting evidence, not the main submission story.

## Local evidence

The bounded completion audit records:

- 20/20 focused runner tests passed;
- 37/37 complete tests passed;
- syntax and boundary checks passed;
- native WebMCP compatibility passed;
- visual proof passed; and
- independent HTTP-origin verification passed.

## Claim language rules

### Safe now

- “The exact private Gate 0 commit passed on a GitHub-hosted Linux runner.”
- “The page registers four WebMCP tools.”
- “The frozen proof produced R1 BLOCK, stale R1 BLOCK, and fresh R2 PASS.”
- “The reference app demonstrates revision-bound visual evidence.”
- “The app is live at https://savs-webmcp-challenge.onrender.com.”
- “The public Render origin passed the independent R0→R1→R2 verifier.”
- “The exact 157.12-second v4 video export passed complete human H2 review.”
- “The YouTube video page is publicly visible at
  https://youtu.be/quJI1JD3FzE with the expected title and description.”
- “The first-party repository source carries a standard MIT license naming
  NSP AI LABS INC.; repository publication remains a separate gate.”

### Safe only after the corresponding public gate passes

- “The public YouTube transcode has passed complete signed-out playback.”
- “The source is public and open source at `<PUBLIC_REPOSITORY_URL>`.”
- “Every required Devpost field is complete.”
- “The final Devpost entry has been submitted.”

### Do not claim

- Gate 0 proves a hosting provider or public judge experience.
- The 1,667-pixel R1 result is universal across browsers and environments.
- A stale audit can approve the latest revision.
- This Challenge workbench is the complete long-range SAVS product.
- A private MIT-licensed repository satisfies the Challenge's public
  repository requirement before anonymous access is verified.

## Environment-sensitive measurements

The frozen Linux receipt may be cited as an exact observation. In narration
and product positioning, prefer the invariant: **non-zero target-only R1
difference, protected regions unchanged, then fresh zero-difference R2**. The
hosted take must display its own measured count.

## Evidence still required

| Boundary | Required evidence |
| --- | --- |
| Provenance | Dated public history or equivalent record separating Challenge WebMCP work from earlier SAVS research |
| Final live check | Public origin remains available and one final native Chrome tool smoke test passes after all submission URLs are fixed |
| ChatGPT | Optional additional evidence only if this route is claimed as tested |
| Public repository | Visible open-source license, complete source/assets/instructions, public access |
| Video publication | Complete signed-out post-transcode playback of the H2-accepted upload at https://youtu.be/quJI1JD3FzE |
| Devpost | Read-only live-form inventory mapped to final copy, all required fields completed |
| Judge access | Free working access maintained through 2026-09-21 17:00 PDT |
