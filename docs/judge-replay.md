# SAVS WebMCP — Judge Replay and Testing Instructions

Status: publication-ready judge instructions for the verified hosted build.

## Fast path for judges

Live URL: https://savs-webmcp-challenge.onrender.com

Recommended browser boundary:

- ChatGPT desktop in-app browser with WebMCP support; or
- Google Chrome 149 or later with WebMCP testing enabled, as described by the official Challenge rules.

No account or credential should be required for the final public demo.

## Expected tools

The top-level page should expose exactly these four tools:

1. `get_visual_state`
2. `apply_compact_layout`
3. `run_visual_audit`
4. `apply_alignment_repair`

The page header should show `4 WebMCP tools available`. If it instead shows `WebMCP unavailable · visible controls active`, the browser has not exposed the WebMCP API; the visible controls still demonstrate the same product operations but do not prove tool discovery.

## Suggested agent instruction

> Inspect the current visual state. If necessary, reset the visible demo to R0. Apply the compact layout with a new idempotency key. Audit the new revision. If the audit blocks because of a registered visual difference, apply only the allowlisted alignment repair against the current revision. Do not use stale evidence to certify a newer revision. Audit the repaired revision again and report the revision, freshness, changed-pixel count, and verdict.

## Expected replay

### 1. Establish R0

Use the visible `Reset to R0` control if the page is not already at R0. Then call:

```text
get_visual_state({})
```

Expected:

- current revision is R0;
- layout density is comfortable;
- metric baseline offset is 0;
- no current audit is required.

### 2. Apply compact layout

Call with a unique key:

```text
apply_compact_layout({"idempotencyKey":"judge-compact-<unique>"})
```

Expected:

- action succeeds;
- transition is R0 → R1;
- layout density is compact;
- metric baseline offset is 2 CSS pixels.

Reusing the same key with identical arguments should replay the same receipt without creating another revision. Reusing it for a different operation or argument set should fail with a typed idempotency conflict.

### 3. Audit R1

```text
run_visual_audit({"revisionId":"R1","auditId":"judge-r1-<unique>"})
```

Expected:

- audited revision R1;
- current revision R1;
- freshness `fresh`;
- verdict `BLOCK`;
- changed pixels greater than zero;
- changed pixels outside registered targets equal zero;
- stable-control changed pixels equal zero;
- reference, current, and difference images visible in the page.

The exact changed-pixel count is deterministic for a fixed verified build and environment, but judges should use the value reported by the live build rather than this draft's local 1,528-pixel receipt.

### 4. Repair R1

```text
apply_alignment_repair({
  "idempotencyKey":"judge-repair-<unique>",
  "expectedRevisionId":"R1"
})
```

Expected:

- transition is R1 → R2;
- only the allowlisted metric-baseline-offset token is repaired;
- the previously displayed R1 audit now reports current revision R2, freshness `stale`, verdict `BLOCK`.

Attempting the repair against the wrong expected revision should fail with a revision conflict and should not create a successor revision.

### 5. Audit R2

```text
run_visual_audit({"revisionId":"R2","auditId":"judge-r2-<unique>"})
```

Expected:

- audited and current revisions are both R2;
- freshness `fresh`;
- changed pixels 0;
- outside-target pixels 0;
- stable-control changed pixels 0;
- verdict `PASS`.

## What each result proves

| Observation | Meaning |
|---|---|
| Compact action returns success | The structured WebMCP operation completed |
| R1 fresh BLOCK | The visible result differs from the approved reference |
| R1 stale BLOCK after R2 | Correct older evidence cannot certify a newer revision |
| R2 fresh PASS with zero difference | The repaired visible result matches the approved reference |
| Human controls work without WebMCP | The shared page remains usable when agent tooling is absent |

## Local reproduction before publication

Requirements:

- Node.js 20 or later;
- Playwright Chromium installed;
- Google Chrome 149 or later for the native WebMCP compatibility boundary.

```sh
npm install
npx playwright install chromium
npm run verify
npm start
```

Then open `http://127.0.0.1:4173`.

`npm run verify` performs JavaScript syntax checks, dependency-boundary checks, unit/API/browser tests, a native Chrome WebMCP compatibility run, and generation of `artifacts/local-proof/index.html`.

## Troubleshooting

### WebMCP unavailable

- Confirm the supported ChatGPT in-app browser or Chrome 149+ WebMCP configuration is active.
- Restart Chrome after changing the WebMCP testing flag.
- Reload the top-level page; tools registered inside an unsupported nested context do not substitute for top-level registration.

### Revision conflict

- Another action already advanced this session.
- Use `Reset to R0`, then restart the replay with new idempotency and audit IDs.
- The deployed build must isolate independent judge sessions; repeated conflicts across clean sessions are a deployment failure.

### Audit takes longer than an action

- An audit starts a controlled headless browser, captures reference/current/stable-control rasters, compares pixels, and publishes evidence.
- A timeout, missing image, browser launch failure, or unresolved audit must not be reported as PASS.

## Availability commitment

The final live project must remain operational, free of charge, and without restriction through the end of judging on 2026-09-21 at 5:00 p.m. PT. If authentication is ever introduced, the Devpost testing instructions must include working judge credentials. The preferred deployment has no authentication.
