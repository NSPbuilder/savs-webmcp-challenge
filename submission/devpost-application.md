# Devpost application copy

> Historical Gate 0-era source draft. Do not paste this file into Devpost.
> The current copy/paste authority is `devpost-final-copy.md`; this longer
> draft remains indexed only for provenance and comparison.

## Project identity

- **Project title:** SAVS: Visual Proof for WebMCP Agents
- **Tagline:** A successful tool call is not a visual verdict.
- **Live app:** https://savs-webmcp-challenge.onrender.com
- **Source repository:** https://github.com/NSPbuilder/savs-webmcp-challenge
- **Demo video:** https://youtu.be/quJI1JD3FzE

## Short description

SAVS is an agent-native visual verification workbench for WebMCP. It shows why
a correctly executed browser tool can still produce a result that looks wrong
to a person. Four page-registered tools let an agent create an immutable UI
revision, inspect it, audit exact rendered pixels, and apply a constrained
repair. The demo deliberately creates a two-CSS-pixel baseline defect, blocks
that revision with visual evidence, refuses the evidence after it becomes
stale, and passes only a fresh audit of the repaired revision.

## The problem

WebMCP gives agents structured, reliable ways to use a website. That solves the
problem of guessing which control to click, but it does not by itself prove
that the human-visible result is correct. A tool call can return success while
text is clipped, metrics are misaligned, a card overflows, or a responsive
layout has regressed.

For people, the final rendered page is the product. For agents, success is
usually a structured response. SAVS connects those two meanings of success.

## What SAVS does

The workbench starts from an approved visual reference, R0. An agent invokes a
valid compact-layout action and receives a successful immutable R1 revision
receipt. The action is operationally correct, yet it introduces a precise
baseline defect visible in the metric strip.

The agent then invokes a visual audit. SAVS rerenders the approved reference
and requested revision, compares their exact pixels, and returns a structured
`BLOCK` result for R1. A constrained repair creates R2. Evidence tied to R1 is
no longer allowed to approve the current state, so the stale result remains
blocked. Only a fresh audit of R2 returns `PASS`.

The human sees the page, revision timeline, and evidence. The agent receives
the same state as structured tools. Neither side has to pretend that an API
success code is a visual verdict.

## Why this is a strong fit for WebMCP

The workflow depends on a website exposing native, semantically meaningful
capabilities instead of making an agent reverse-engineer the UI. The page
registers four tools with `document.modelContext.registerTool`:

- `get_visual_state` reads the current immutable revision and visible audit;
- `apply_compact_layout` performs the successful action that creates R1;
- `run_visual_audit` compares an explicitly requested revision to the approved
  reference and reports freshness;
- `apply_alignment_repair` creates a successor revision using one allowlisted
  repair and an expected-revision precondition.

The agent can discover and invoke these tools through the WebMCP surface, while
the website retains visible controls for a person. Revision IDs, expected-state
checks, idempotency keys, and structured audit results make the collaboration
explicit and reproducible.

## How it creates a better user experience

Without this contract, a person often discovers visual damage after an agent
reports completion. With SAVS, the defect becomes a first-class result inside
the same workflow. The user can see what changed, the agent can understand why
the result is blocked, and a repair cannot inherit approval from an older
screen state.

The experience is compact: one successful action, one visible defect, one
repair, and two opposite visual verdicts. It makes a subtle failure legible
without turning the user into a manual screenshot reviewer.

## What people and agents can do together now

A person can define and recognize the approved visual intent. An agent can
operate the page through stable tools, receive a machine-readable visual
verdict, repair only the allowed property, and request fresh proof. Together
they can preserve human-visible quality across agent-driven changes without
requiring the agent to guess from DOM structure or the person to replay every
action manually.

## Implementation

The reference app is self-contained. A Node.js server stores isolated sessions,
immutable revisions, idempotency receipts, and audit records. The browser
registers the four WebMCP tools and renders the current revision and evidence.
A controlled renderer produces the approved and candidate PNGs; the verifier
checks exact pixel differences, a stable control region, the permitted target
region, and evidence freshness.

Native Chrome compatibility testing uses the asynchronous
`document.modelContext.getTools` and `executeTool` path. A separate
independent-origin test runs the full visible workflow against an HTTP origin.
The exact Gate 0 commit also passed on a GitHub-hosted Ubuntu 24 Linux
amd64 runner.

The application server imports Node.js built-ins and local modules. The package
installs Playwright for development and test verification; it is not a
third-party runtime data service.

## Evidence from the frozen Gate 0 revision

For exact Gate 0 commit
`fdc78a1c3a083e1fc7557b3375b82a0b964617d1`, the Linux receipt recorded:

- fresh R1: `BLOCK`, 1,667 changed target pixels, zero outside-target pixels,
  and zero stable-control pixels;
- stale R1 after the session advanced to R2: `BLOCK`;
- fresh R2: `PASS` with zero changed pixels;
- container startup, stop, cleanup, and zero residual container IDs.

The exact changed-pixel count is environment-specific. The product invariant is
a non-zero, target-only R1 difference followed by a fresh zero-difference R2
result.

## Judging-criteria mapping

### WebMCP Leverage

The four tools are not wrappers around arbitrary clicks. They expose a
revisioned visual-verification protocol: read state, create a revision, audit
that exact revision, and create a constrained successor. Native tool discovery
and invocation are exercised in browser tests.

### Execution

The visible workbench, structured tools, server-side revision model, controlled
renderer, evidence images, and independent-origin verification form one
coherent runnable experience. The demo has a complete beginning, failure,
repair, stale-evidence refusal, and fresh pass.

### Potential Impact

The immediate audience is anyone building agent-operated websites, visual QA,
design systems, page builders, commerce interfaces, or content workflows. As
agents perform more valid structured actions, teams need equally structured
proof that the rendered result remains acceptable to people.

### Creativity and ambition

SAVS treats visual approval as a revision-bound artifact rather than a casual
screenshot or a property of the latest page. That enables an unusual but
important result: the same action can be technically successful and visually
blocked, and an old pass can never silently approve a newer screen.

## Testing instructions

1. Open https://savs-webmcp-challenge.onrender.com in ChatGPT's in-app browser.
   Alternatively, use Chrome 149
   or later, enable `chrome://flags/#enable-webmcp-testing`, and restart Chrome.
2. Confirm that the page reports four WebMCP tools.
3. Invoke `get_visual_state` and confirm the current revision is R0.
4. Invoke `apply_compact_layout` with a unique `idempotencyKey`; confirm the
   action succeeds and creates R1.
5. Invoke `run_visual_audit` for R1; confirm the fresh verdict is `BLOCK` with a
   non-zero target-only difference.
6. Invoke `apply_alignment_repair` with a new `idempotencyKey` and
   `expectedRevisionId: "R1"`; confirm it creates R2.
7. Confirm that evidence tied to R1 is stale and remains `BLOCK`.
8. Invoke `run_visual_audit` for R2; confirm the fresh verdict is `PASS` with
   zero changed pixels.

No account or test credential is planned for the live demo. If the deployment
route changes, the final Devpost testing instructions must state the exact
access method.

## Provenance note for finalization

Before submission, the public repository must include a dated, inspectable
record distinguishing this Challenge reference implementation and its WebMCP
work from any earlier SAVS research. Do not replace this note with a stronger
claim until the provenance gate in `publication-checklist.md` is complete.
