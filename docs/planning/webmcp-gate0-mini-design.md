# SAVS WebMCP Gate 0 Mini-Design

Status: proposed implementation contract. Scope: the standalone private
`savs-webmcp-challenge` project only.

## Routed owners

- Direct owner: `savs-webmcp-challenge` application, packaging, and private
  documentation.
- Contract owner: `savs-webmcp-challenge` page-to-API `sessionId` protocol and
  its existing R0/R1/R2 state machine.
- Evidence owner: challenge unit/API/browser tests, native Chrome compatibility
  run, the future external-origin verifier, and the exact candidate container.
- Analogy/evidence input only: private `nsp-savs`; it is not an authorized
  target, dependency, image input, or publication source.

## Frozen objective

Implement and prove the local deployment Gate 0 defined in
`docs/deployment-plan.md:27-59`: page-level visitor isolation, the smallest
pinned Node/Playwright container, a repeatable external-origin verification
command, and a real local-container proof. Stop before provider selection or
any public/external mutation.

## Step 1 — State-of-substrate snapshot

- The main page currently uses one hard-coded `challenge` session for every
  visitor (`app/app.js:1`). The specimen URL, state refresh, reset, compact,
  audit, and repair calls all use that value (`app/app.js:67-74` and
  `app/app.js:149-205`).
- WebMCP tools call those same functions, while visible buttons call the same
  reset/compact/audit/repair functions (`app/app.js:220-223` and
  `app/app.js:231-303`). This is the existing shared human/agent state path to
  preserve.
- `RevisionStore` already keys independent in-memory sessions by arbitrary
  non-empty `sessionId`; missing sessions lazily receive R0
  (`lib/store.mjs:36-63` and `lib/store.mjs:138-141`). The state machine does
  not need a new storage abstraction.
- The server already carries `sessionId` through state, specimen, reset,
  actions, audits, audit-id deduplication, and freshness checks
  (`server.mjs:126-236`). It already reads `HOST` and `PORT` when launched
  directly (`server.mjs:278-285`).
- Every audit launches Playwright Chromium, creates a controlled context, and
  closes the browser in `finally` (`verifier/controlled-renderer.mjs:34-71`).
- Existing browser evidence covers the complete WebMCP flow and visible-control
  availability at desktop/mobile widths, but only one page/session at a time
  (`tests/e2e.test.mjs:47-143`).
- Existing packaging has `npm start`, Playwright 1.62.1, and no container
  scripts (`package.json:11-25`). The source-boundary checker covers the current
  source roots but not Dockerfile-style extensionless files
  (`scripts/check-boundary.mjs:6-9`).
- The local proof has an explicit source list that predates container files and
  an external-origin verifier (`scripts/generate-local-proof.mjs:12-36`).
- No `Dockerfile`, `.dockerignore`, or external-origin deployment verifier
  exists. Scoped `rg --files` and direct path checks on 2026-08-30 found none.
- The host is arm64 macOS. `docker`, `podman`, `nerdctl`, `colima`, `limactl`,
  `finch`, `orbctl`, and `rdctl` are all absent, so a real Linux container run
  cannot occur until a container runtime is installed or made available.
- The official Playwright Docker documentation and Microsoft Artifact Registry,
  checked 2026-08-30, list `mcr.microsoft.com/playwright:v1.62.1-noble` and
  require the image version to match the project package. The multi-platform
  image index digest is
  `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
  The exact 200 response metadata and OCI index for Linux `amd64` and `arm64`
  are bound in
  `docs/planning/evidence/playwright-v1.62.1-noble-manifest.json`, fetched from
  Microsoft's registry v2 endpoint.

## Step 2 — Gap analysis

- Gap G1: visitors share one mutable application session because
  `app/app.js:1` is constant. No existing E2E opens two independent contexts
  and compares their application `sessionId` or revisions
  (`tests/e2e.test.mjs:47-143`).
- Gap G2: there is no reproducible Linux browser image or build-context
  allowlist, despite the server launching Chromium for every audit
  (`verifier/controlled-renderer.mjs:34-71`).
- Gap G3: `npm run verify` starts an in-process server; there is no command that
  treats a supplied origin as an opaque deployed service and proves page load,
  evidence URLs, two-context isolation, the full revision chain, and visible
  controls (`package.json:11-21`).
- Gap G4: the proof/source-boundary lists would omit new deployment files unless
  they are updated (`scripts/check-boundary.mjs:6-9` and
  `scripts/generate-local-proof.mjs:14-36`).
- Gap G5: no real candidate-container evidence can currently be produced because
  this host has no container runtime. Static Dockerfile inspection is not a
  substitute for browser launch, audit, memory, shutdown, or architecture
  evidence.

## Step 3 — Design intent

- User intent, 2026-08-30: “那么执行下一步，直到需要我决策或者操作的时候停下。”
- Authorized prior decision: `docs/deployment-plan.md:21-42` freezes one small
  container, no database/queue/service split, page-generated opaque sessions,
  shared WebMCP/visible-control state, two-context tests, and provider choice
  only after local proof.
- Gate 0 acceptance comes from `docs/deployment-plan.md:44-59`; provider and
  public-host behavior belong to later gates (`docs/deployment-plan.md:61-110`).
- Existing R0/R1/R2 transitions, tool names, exact visual comparison, stale
  refusal, and synthetic fixtures must remain unchanged.

## Step 4 — Smallest bridge

### p1 — Isolate one page without changing the state machine

- Change `app/app.js`: replace the fixed session with one opaque
  `crypto.randomUUID()`-derived identifier created once when that top-level page
  script loads. Force refresh/reset/compact/audit/repair to use it; tool
  arguments cannot override the page session.
- Change `tests/e2e.test.mjs`: add one two-browser-context test that first fails
  on the current fixed ID, then proves distinct session IDs, mutation isolation,
  and reset isolation while checking tool/UI agreement.
- Estimated delta: 1 changed constant, 3 removed override branches, about 45
  test lines.
- Why evolve in place: the store and server already implement session-keyed
  isolation; a new session service, cookie protocol, database, or server-issued
  token would duplicate existing ownership.

### p2 — Package only the existing runtime

- Add `Dockerfile` pinned to the Playwright 1.62.1 Noble multi-platform digest.
  Copy `package.json` and `package-lock.json` first, run `npm ci --omit=dev`,
  then copy only `app`, `lib`, `verifier`, and `server.mjs`; set
  provider-neutral `HOST=0.0.0.0`/default `PORT=4173`, and use `npm start`.
- Add `.dockerignore` excluding Git metadata, dependencies, `.nsp`, artifacts,
  docs, tests, scripts, logs, and other non-runtime inputs. Explicit Docker
  `COPY` remains the authoritative runtime allowlist.
- Estimated delta: about 25 declarative lines.
- Why not another service: the current one-process server already owns every
  required route and launches the verifier locally.

### p3 — Add one reusable deployed-origin verifier

- Add `scripts/verify-deployment.mjs`, driven by `TARGET_ORIGIN`. It launches a
  host-side Playwright browser only to act as two visitors; all visual audits
  execute through the target server. It proves `/`, distinct page sessions,
  isolation/reset behavior, R1 BLOCK, stale rejection, fresh R2 PASS, PNG
  evidence retrieval, visible controls without WebMCP, and records audit
  latency.
- Update `package.json`, `README.md`, `scripts/check-boundary.mjs`, and
  `scripts/generate-local-proof.mjs` so syntax, source-boundary, documentation,
  and proof manifests include the new deployment surface.
- Estimated delta: about 150 verifier lines and 30 manifest/documentation lines.
- Why one script: duplicating the complete flow in shell or provider-specific
  configuration would create parallel acceptance paths.

### p4 — Execute, measure, and stop at the real boundary

- With a container runtime, build the exact Dockerfile, run with `--init`, an
  explicit host port, and the provider-neutral environment, then execute
  `TARGET_ORIGIN=<origin> npm run verify:deployment`.
- Record image identity/architecture, cold start, R1/R2 audit latency, one
  overlapping-audit result, peak container memory, stop result, and absence of
  a running container after shutdown in an image-bound receipt.
- Without a container runtime, complete p1-p3 and their native tests, then stop
  with p4 explicitly unverified. Do not select a provider or reinterpret local
  Node tests as Linux container evidence.
- Why no fallback: Colab/Kaggle or a rented host would cross into an external
  provider decision and would not prove the exact local container contract.

## Step 5 — Acceptance bar

### p1 acceptance

- Implementation: `app/app.js` contains no fixed `challenge` session and no
  action path accepts a caller-supplied session override.
- Tests: the new E2E fails before the app change and passes afterward; two
  independent browser contexts report different non-empty session IDs.
- Runtime: context A can reach R1 while B stays at R0; resetting B leaves A at
  R1; visible revision labels and `get_visual_state` agree in both contexts.
- Regression: existing complete tool flow, stale refusal, repaired PASS,
  responsive rendering, store/API tests, and native Chrome compatibility pass.

### p2 acceptance

- Implementation: Dockerfile base version matches Playwright 1.62.1 and is
  digest-pinned; only runtime paths enter the final image; `.dockerignore`
  excludes dependency, generated, private-state, and development subtrees.
- Tests: syntax/source-boundary checks include all new files and contain no
  private runtime import or absolute development-machine path.
- Runtime: deferred until p4; file inspection alone cannot complete p2's
  container-runtime category.

### p3 acceptance

- Implementation: `npm run verify:deployment` requires an explicit
  `TARGET_ORIGIN`, never starts an in-process server, and emits one JSON outcome.
- Tests: syntax check passes; running it against a normal local `npm start`
  instance passes the external-origin full chain and two-context isolation.
- Documentation: README states exact local-container commands and clearly marks
  real container proof as pending until run.

### p4 acceptance

- Build: the pinned image builds from `package-lock.json` with a clean
  `npm ci --omit=dev`.
- Runtime: service binds supplied `HOST`/`PORT`; `/` loads; Chromium launches
  inside the container; full chain, evidence PNGs, two contexts, reset
  isolation, and visible controls pass through the mapped origin.
- Measurements: receipt binds image digest and architecture, records cold start,
  audit latency, overlapping-audit outcome, and peak memory.
- Shutdown: the container stops successfully and is no longer running; no
  browser subprocess survives that container lifecycle.

## Non-goals

- Public or hosted deployment, provider selection, account/credential work,
  payment, public repository, license selection, YouTube, or Devpost mutation.
- Any modification or import of private `nsp-savs` or `nsp-core`.
- Database, queue, authentication, persistent customer state, multi-region
  infrastructure, generalized visual-audit service, or SAVS algorithm change.
- Claiming Gate 0 complete before the exact Linux container run passes.

## Authorized targets

- `app/app.js`
- `tests/e2e.test.mjs`
- `Dockerfile`
- `.dockerignore`
- `scripts/verify-deployment.mjs`
- `package.json`
- `README.md`
- `scripts/check-boundary.mjs`
- `scripts/generate-local-proof.mjs`
- `docs/planning/evidence/playwright-v1.62.1-noble-manifest.json`
- generated local proof/container evidence and scoped execution-integrity
  records required to verify this revision

## Residual risks and promotion triggers

- In-memory sessions and evidence are acceptable for Gate 0 but remain process
  local. Promote only if a measured hosted probe shows restart or memory
  behavior prevents judging.
- The container base is multi-platform, but only the architecture actually
  built and recorded is proved. A provider on another architecture requires its
  own build/run evidence.
- A public origin, WebMCP-enabled Chrome against HTTPS, and optional ChatGPT
  in-app-browser run remain Gate 2/3 evidence, not Gate 0.
