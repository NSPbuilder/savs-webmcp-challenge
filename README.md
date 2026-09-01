# SAVS: Visual Proof for WebMCP Agents

**A successful tool call is not a visual verdict.**

SAVS is a self-contained WebMCP reference implementation that gives agents
revision-bound evidence about human-visible results. A valid compact-layout
action succeeds and creates R1, but a subtle two-CSS-pixel baseline defect
causes a fresh visual audit to return `BLOCK`. A constrained repair creates
R2; the old R1 evidence remains stale and blocked, and only a fresh R2 audit
returns `PASS`.

- Live workbench: https://savs-webmcp-challenge.onrender.com
- Demo video: https://youtu.be/quJI1JD3FzE
- Challenge application materials: [`submission/`](submission/)

## Why WebMCP matters here

The page registers four native tools through
`document.modelContext.registerTool`:

- `get_visual_state` reads the current immutable revision and audit state;
- `apply_compact_layout` creates the deliberately defective R1 revision;
- `run_visual_audit` audits an explicitly requested revision and reports
  evidence freshness;
- `apply_alignment_repair` creates a successor revision using an allowlisted
  repair and an expected-revision precondition.

The tools are semantic capabilities, not wrappers around screen coordinates.
The visible controls use the same application endpoints, so the person and
agent share the same state, history, evidence, and verdicts.

## Demonstrated flow

1. Start from approved reference R0.
2. Invoke `apply_compact_layout`; the action succeeds and creates R1.
3. Audit R1; a target-only pixel difference produces fresh `BLOCK`.
4. Invoke `apply_alignment_repair` with `expectedRevisionId: "R1"`; it creates
   immutable successor R2.
5. Observe that R1 evidence is stale and remains `BLOCK`.
6. Audit R2; a fresh zero-difference result produces `PASS`.

The exact changed-pixel count can vary by rendering environment. The product
invariant is a non-zero, target-only R1 difference with protected regions
unchanged, followed by a fresh zero-difference R2 result.

## Architecture

- A Node.js server maintains isolated sessions, immutable revisions,
  idempotency receipts, and audit records.
- The browser renders the workbench and registers the four WebMCP tools.
- A controlled renderer produces approved-reference and candidate PNGs.
- The verifier checks exact pixels, a stable control region, the permitted
  target region, and revision freshness.
- The app has no runtime import from the private `nsp-savs` research project.

## Run locally

Requirements: Node.js 20 or newer, a Playwright Chromium installation, and
Google Chrome 149 or newer for the native WebMCP verification boundary.

```sh
npm install
npx playwright install chromium
npm start
```

Open `http://127.0.0.1:4173`.

## Verify

```sh
npm run verify
```

This runs syntax and dependency-boundary checks, unit/API/browser tests, a
native Chrome WebMCP compatibility run, and an image-rich local proof report.

To verify the public deployment independently:

```sh
TARGET_ORIGIN=https://savs-webmcp-challenge.onrender.com npm run verify:deployment
```

## Test the native WebMCP tools manually

1. Use Chrome 149 or later.
2. Enable `chrome://flags/#enable-webmcp-testing` and restart Chrome.
3. Open the local or public workbench.
4. Discover the four registered tools and invoke the R0→R1→R2 sequence above.

No account or credential is required for the public workbench.

## Challenge-period provenance

SAVS began as pre-existing visual-verification research. During the WebMCP
Challenge period, this standalone repository added the page-registered
four-tool interface, immutable revision workflow, freshness-bound verdicts,
constrained repair, native browser verification, public deployment, and demo.
See [`submission/challenge-period-provenance.md`](submission/challenge-period-provenance.md)
for the bounded distinction between the prior research and this entry.

## Evidence boundary

The exact Gate 0 implementation revision passed on a GitHub-hosted Ubuntu 24
Linux runner. The same R1 fresh `BLOCK` → R1 stale `BLOCK` → R2 fresh `PASS`
chain passed against the public Render origin. The accepted 157.12-second v4
video has passed complete human playback and is publicly listed at
https://youtu.be/quJI1JD3FzE. Complete signed-out playback after YouTube's
transcode remains the final video-publication check.

The first-party source is licensed under the MIT License, copyright (c) 2026
NSP AI LABS INC.; see [`LICENSE`](LICENSE). Repository visibility and Devpost
submission are separate external gates controlled by the entrant.

## License

MIT © 2026 NSP AI LABS INC.
