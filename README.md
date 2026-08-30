# SAVS WebMCP Challenge

This private reference implementation demonstrates one precise idea: a structured browser action can
succeed while the resulting interface still contains a human-visible optical defect. Visual evidence
must be bound to the exact revision it inspected before an agent can use it as a completion claim.

The local flow starts from approved revision R0, applies a compact-layout action to create defective
R1, runs a controlled reference/current raster comparison, refuses to let stale R1 evidence certify a
newer revision, applies one allowlisted alignment repair to create R2, and requires a fresh zero-diff
audit before reporting PASS.

## Local use

Requirements: Node.js 20 or newer, a Chromium browser installed by Playwright, and Google Chrome 149
or newer for the native WebMCP verification boundary.

```sh
npm install
npx playwright install chromium
npm start
```

Open `http://127.0.0.1:4173`. The visible controls and the four imperative WebMCP tools use the same
application endpoints.

## Verification

```sh
npm run verify
```

The command performs syntax and dependency-boundary checks, unit/API/browser tests, a native Google
Chrome run of the current `document.modelContext.registerTool/getTools/executeTool` API with the local
WebMCP test feature enabled, and generation of an image-rich local proof report at
`artifacts/local-proof/index.html`.

## Private CI container Gate 0

The candidate image is pinned to the Playwright 1.62.1 Noble multi-platform index and contains only
the package manifests plus `app`, `lib`, `verifier`, and `server.mjs`. Gate 0 runs only when a
maintainer manually dispatches the private `Gate 0 container proof` workflow on `main`; it is not a
push, pull-request, scheduled, deployment, registry, or publication workflow.

```sh
gh workflow run gate0-container-proof.yml --ref main
```

The standard Ubuntu job builds the exact Dockerfile, runs the candidate container, invokes
`verify:deployment` through its mapped origin, measures the observed image/runtime, audit latency and
cgroup peak memory, checks that Chromium closes, then stops and removes the container. Its only
upload candidate is a source-bound `receipt.json` capped at 1 MiB and retained for one day.

`verify:deployment` checks two independent page sessions, the complete R1 BLOCK → stale → R2 PASS
chain, PNG evidence, two concurrently issued audits, and the visible controls without WebMCP. A CI
receipt proves only that exact private commit and runner; the later public HTTPS origin must pass the
same verifier independently.

## Current boundary

This repository is private and `UNLICENSED` while it is under review. It is not yet a hosted demo,
public Challenge entry, ChatGPT in-app-browser result, video, or submission. It contains no runtime
import from the private `nsp-savs` project. The candidate container definition and manual workflow
are present, but Gate 0 remains pending until the real private Linux receipt passes.
