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

## Current boundary

This repository is private and `UNLICENSED` while it is under review. It is not yet a hosted demo,
public Challenge entry, ChatGPT in-app-browser result, video, or submission. It contains no runtime
import from the private `nsp-savs` project.
