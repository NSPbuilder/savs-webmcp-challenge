# Devpost final copy

This is the copy/paste source for the live submission form. The live app,
public source repository, and public YouTube page are bound below; remaining
human and Devpost gates are tracked in `publication-checklist.md`.

## Project identity

- **Name:** SAVS: Visual Proof for WebMCP Agents
- **Tagline:** A successful tool call is not a visual verdict.
- **Live app:** https://savs-webmcp-challenge.onrender.com
- **Source code:** https://github.com/NSPbuilder/savs-webmcp-challenge
- **Demo video:** https://youtu.be/quJI1JD3FzE

## One-sentence pitch

SAVS gives WebMCP agents revision-bound visual evidence, so a successful page
action can be blocked when its rendered result looks wrong and approved only
after the repaired revision receives a fresh audit.

## Short description

SAVS is an agent-native visual verification workbench for WebMCP. Four native
page tools let an agent read an immutable UI state, create a new revision,
audit the exact rendered result, and apply a constrained repair. The demo
deliberately creates a subtle two-CSS-pixel baseline defect: the page action
succeeds, but SAVS returns `BLOCK` for that revision. A repair creates a new
revision, old evidence remains stale and blocked, and only a fresh audit of
the repaired result returns `PASS`. The person and agent see the same state,
history, evidence, and verdicts.

## Inspiration

WebMCP makes website actions explicit and reliable, but successful execution
does not prove that the human-visible result is correct. An agent can invoke
the right tool and still leave clipped text, a shifted baseline, an overflow,
or another visual regression behind. People experience the rendered page;
agents usually receive a structured action result. We built SAVS to connect
those two meanings of success.

## What it does

The workbench begins at approved reference revision R0. The agent invokes a
valid compact-layout tool, which succeeds and creates immutable revision R1.
R1 contains a small but visible baseline defect in the metric strip.

The agent then audits R1. SAVS rerenders the approved reference and requested
revision, compares their pixels, and returns a fresh `BLOCK` verdict with
visual evidence. A constrained alignment repair creates successor revision
R2. The earlier R1 result cannot approve R2 because its evidence is bound to
R1 and is now stale. Only a fresh audit of R2 returns `PASS`.

This creates a shared proof surface: the agent receives structured,
revision-bound results while the person can inspect the same defect, repair,
timeline, and verdicts on the page.

## Why it is a strong use of WebMCP

The workflow depends on native, semantically meaningful page capabilities—not
an agent guessing which coordinates to click. The page registers four tools
with `document.modelContext.registerTool`:

- `get_visual_state` reads the current immutable revision and audit state;
- `apply_compact_layout` performs the valid action that creates R1;
- `run_visual_audit` audits an explicitly requested revision and reports
  whether its evidence is fresh;
- `apply_alignment_repair` creates a successor revision using an allowlisted
  repair and an expected-revision precondition.

WebMCP gives the agent a reliable action surface. SAVS adds a result contract
for what the person actually sees.

## How it improves the user experience

Without this contract, a person often discovers visual damage only after an
agent reports completion. With SAVS, a visual defect becomes a first-class
result inside the same workflow. The user can see what changed, the agent can
understand why the revision is blocked, and an old approval cannot silently
carry over to a newer screen.

The demo keeps that idea legible: one successful action, one subtle defect,
one constrained repair, and two opposite visual verdicts.

## What people and agents can do together now

A person can define and recognize the approved visual intent. An agent can
operate the page through stable tools, receive a machine-readable visual
verdict, repair only an allowed property, and request fresh proof. Together
they can preserve human-visible quality across agent-driven changes without
forcing the agent to infer visual truth from DOM structure or forcing the
person to manually replay every action.

## How we built it

The reference app is self-contained. A Node.js server maintains isolated
sessions, immutable revisions, idempotency receipts, and audit records. The
browser renders the current revision and evidence while registering the four
WebMCP tools. A controlled renderer produces reference and candidate PNGs. The
verifier checks exact pixel differences, protects a stable control region,
limits accepted changes to the intended target, and binds every audit to its
requested revision.

The same R0→R1→R2 flow is exercised through native WebMCP discovery and
invocation in Chrome and through an independent public-origin verifier. The
public Render deployment requires no account or credentials.

## Challenges we ran into

The hardest part was not detecting that pixels changed. It was making the
result trustworthy across time. An audit that was valid for R1 must not become
approval for R2, and a repair must not overwrite the history that explains
the failure. That led us to immutable revisions, freshness-aware verdicts,
expected-revision checks, and idempotent action receipts.

The demo also exposed a more human problem: a two-pixel baseline defect can be
obvious to a viewer while looking harmless in code or DOM geometry. We made
the rendered pixels—not styling intent—the final evidence boundary.

## Accomplishments that we are proud of

- Four real page-registered WebMCP tools form one coherent workflow.
- A technically successful action produces a visible defect and a structured
  fresh `BLOCK` verdict.
- Stale evidence remains blocked after the page advances to a new revision.
- A constrained repair creates R2 without erasing R1.
- A fresh R2 audit returns `PASS` with zero changed pixels.
- The same behavior has been verified at the public Render origin.
- The accepted 2:37 demo uses real native WebMCP calls, audible narration, and
  burned-in English captions.

## What we learned

Structured tools solve action ambiguity, but agents also need structured
evidence about outcomes. Visual approval is not a timeless property of a
page; it belongs to a particular rendered revision. That small change in the
contract makes failure, repair, and approval understandable to both the agent
and the person supervising it.

## What's next

This Challenge workbench proves the smallest complete loop. The longer-term
direction is to generalize the same revision-bound visual contract across
real applications, responsive states, and richer human-approved visual
intent—while keeping the evidence inspectable by both people and agents.

## Built with

JavaScript, Node.js, HTML, CSS, WebMCP, Playwright, Chromium/Google Chrome,
exact PNG comparison, and Render.

## Testing instructions

No account or credentials are required.

1. In Chrome 149 or later, enable
   `chrome://flags/#enable-webmcp-testing`, restart Chrome, and open
   https://savs-webmcp-challenge.onrender.com.
2. Confirm that the workbench reports four available WebMCP tools.
3. Invoke `get_visual_state`; the initial revision is R0.
4. Invoke `apply_compact_layout` with a unique `idempotencyKey`; it succeeds
   and creates R1.
5. Invoke `run_visual_audit` for R1; the fresh verdict is `BLOCK` with a
   non-zero difference limited to the intended target.
6. Invoke `apply_alignment_repair` with a new `idempotencyKey` and
   `expectedRevisionId: "R1"`; it creates R2.
7. Observe that the R1 evidence is now stale and remains `BLOCK`.
8. Invoke `run_visual_audit` for R2; the fresh verdict is `PASS` with zero
   changed pixels.

The visible controls provide the same sequence for human inspection, but the
Challenge demonstration and steps above use the native WebMCP tools.

## Challenge-period provenance

SAVS began as pre-existing visual-verification research. During the Challenge
period, we built this self-contained WebMCP reference implementation: a new
page-registered four-tool interface, immutable revision workflow,
freshness-bound visual verdicts, constrained repair path, native WebMCP
browser verification, public deployment, and Challenge demo. This repository
does not import the private SAVS research runtime; it contains the source,
assets, instructions, and evidence for the submitted WebMCP implementation.
