# SAVS WebMCP Gate 0 CI Container Proof — Revision 5 Mini-Design

Status: proposed replacement contract for Gate 0 container-runtime evidence.
Scope: the private standalone `savs-webmcp-challenge` repository only.

## Routed owners

- Direct owner: `savs-webmcp-challenge` packaging, proof runner, private CI
  workflow, and project documentation.
- Contract owner: the existing Dockerfile/start contract and Gate 0 acceptance
  records inside `savs-webmcp-challenge`.
- Evidence owner: the exact pushed private commit, GitHub-hosted Ubuntu runner,
  candidate container, external-origin verifier, uploaded receipt, and the
  downloaded local receipt copy.
- Analogy/evidence input only: private `nsp-savs`; it remains unchanged and is
  not a workflow input, dependency, image layer, or publication source.

## Frozen objective

Replace the unexecutable local-container portion of Gate 0 with one manually
triggered, ephemeral Linux CI proof against the exact private commit and pinned
Dockerfile. The proof must build the candidate image, start it, run the existing
external-origin R0/R1/BLOCK/stale/R2/PASS chain, record bounded runtime evidence,
stop and remove the container, and return a small source-bound receipt. This is
container/package evidence, not public-host or Challenge-submission evidence.

## Step 1 — State-of-substrate snapshot

- The page now creates one opaque session per top-level page script and forces
  state, reset, compact, audit and repair through it (`app/app.js:1` and
  `app/app.js:149-205`).
- The two-context browser test proves distinct session IDs, mutation isolation,
  reset isolation and UI/tool agreement (`tests/e2e.test.mjs:121-171`).
- The candidate image is version- and digest-pinned, installs from the lockfile,
  copies only runtime paths, binds `0.0.0.0:4173`, and starts with `npm start`
  (`Dockerfile:1-20`).
- The build context excludes Git, `.nsp`, dependencies, artifacts, docs, tests
  and scripts (`.dockerignore:1-12`).
- The server honors `HOST` and `PORT` when launched directly
  (`server.mjs:278-285`).
- The external verifier requires `TARGET_ORIGIN`; it does not import or start the
  project server (`scripts/verify-deployment.mjs:1-13`). It proves distinct
  sessions (`scripts/verify-deployment.mjs:125-136`), R1 BLOCK and PNGs
  (`scripts/verify-deployment.mjs:138-148`), R2 PASS and PNGs
  (`scripts/verify-deployment.mjs:161-169`), a real audit/repair stale race
  (`scripts/verify-deployment.mjs:177-191`), two concurrently issued audits
  (`scripts/verify-deployment.mjs:193-203`), and visible controls
  (`scripts/verify-deployment.mjs:205-222`).
- `package.json` exposes syntax, boundary, native, external-origin and proof
  commands but no container lifecycle receipt command (`package.json:11-22`).
- The boundary checker covers application source and Docker declarative files,
  but not `.github/workflows/*.yml` because `.github/workflows` is not a source
  root and `.yml` is not a text extension (`scripts/check-boundary.mjs:7-16`).
- The local proof manifest includes the Dockerfile and external verifier but no
  CI workflow or container proof runner (`scripts/generate-local-proof.mjs:14-39`).
- The currently observed private remote is `NSPbuilder/savs-webmcp-challenge`, default branch
  `main`, baseline commit
  `ea86af67d9b073003e15076b730c664b7c77cbda`; Actions is enabled and no workflow
  currently exists. The exact 2026-08-30 observation and pinned action commits
  are recorded in
  `docs/planning/evidence/github-actions-gate0-boundary.json`.
- The current working tree contains the completed-but-unpushed Gate 0 p1/p3 and
  container-source changes. p1 and p3 passed; p2 source/package definition is
  complete but its runtime acceptance is unproved; p4 has not run. The bounded
  receipt is
  `.nsp/execution-integrity/v1/tasks/webmcp-gate0/revisions/rev-002/bounded-progress-receipt.json`.
- No Docker-compatible runtime exists on this Mac. GitHub billing usage is not
  readable with the current token because it lacks `user` scope. A standard
  runner is not itself proof of zero cost. Before triggering, this revision must
  verify at least 30 included Linux minutes and 10 MiB artifact headroom remain,
  or verify account controls that block all paid overage. If neither can be
  verified, stop for user direction. It may not alter billing, approve paid
  overage, choose a paid runner, or retry after any terminal workflow attempt
  without new user authorization
  (`docs/planning/evidence/github-actions-gate0-boundary.json`).

## Step 2 — Gap analysis

- Gap G1: revision 2 freezes a local-container objective and stop condition, so
  running CI without a new coherent objective, p2/p4 acceptance boundary and
  external-workflow authorization would violate the frozen contract.
- Gap G2: no executable owner currently builds, starts, measures, stops and
  writes one deterministic container receipt; embedding the whole lifecycle in
  workflow YAML would leave the critical cleanup and evidence logic without
  JavaScript syntax checking or focused code review.
- Gap G3: no workflow exists, so the exact private commit cannot enter an
  ephemeral Linux container boundary and no run ID can be bound to the receipt.
- Gap G4: current source/boundary manifests omit workflow YAML and a future proof
  runner, so existing checks could report PASS while missing the new execution
  surface.
- Gap G5: private Actions allowance and overage controls are unknown. A standard
  runner can still incur charges after included quota is exhausted; runner/time/
  artifact limits alone do not prove a zero-paid-overage boundary.
- Gap G6: a CI PASS could be mislabeled as public-host evidence unless README,
  deployment planning and the receipt explicitly retain the later hosted-origin
  gate.

## Step 3 — Design intent

- User, 2026-08-30: “重新冻结验收合同 授权添加、推送和手动触发私有 workflow”.
- The critic-approved route is: no local Docker installation; use one private,
  manually triggered GitHub Actions Ubuntu proof; preserve Linux/container/
  Chromium evidence; do not equate it with final hosting; obtain explicit
  authorization for contract revision, workflow push and trigger. That
  authorization is now supplied by the user.
- Existing behavior remains fixed: four WebMCP tools, R0/R1/R2 state machine,
  exact raster comparison, stale refusal, per-page isolation, visible controls,
  and private/UNLICENSED repository status.
- No payment, public repository, license change, deployment, registry push,
  YouTube upload or Devpost mutation is authorized.

## Step 4 — Smallest bridge

### p1 — Replace the Gate 0 evidence contract coherently

- Keep revisions 2 and blocked 3/4 immutable as history. Freeze this corrected
  complete plan as revision 5.
- Use the existing bounded Gate 0 integrity pattern: hash only every authorized
  target plus named protected invariants, freeze create-once absences, and write
  a bounded proportionality report/contract. Do not install another critic,
  invoke a scanner that requires it, or traverse the NSP repository root.
- Update `docs/deployment-plan.md` and `README.md` after implementation so Gate 0
  names an ephemeral private Linux runner, p2/p4 runtime acceptance, the later
  hosted-origin gate, and the no-payment boundary.
- Create revisioned execution-integrity records and bind the final downloaded CI
  evidence. Do not rewrite revision 2 records.
- Estimated delta: one new mini-design, focused edits to two current documents,
  and generated revision 5 bounded integrity records.
- Why not edit history: revision 2 accurately records the earlier local contract
  and must remain auditable.

### p2 — Add one container lifecycle and receipt owner

- Add `scripts/run-gate0-container-proof.mjs` using only Node standard libraries.
  It must use argument arrays rather than shell-concatenated commands; build the
  exact Dockerfile; inspect image ID/OS/architecture/size; run with `--init`,
  `--ipc=host`, explicit loopback port and `HOST`/`PORT`; poll `/`; execute the
  existing `scripts/verify-deployment.mjs`; read cgroup peak memory; capture
  final container stats/logs/processes; assert no Chrome/Chromium process remains
  after audits; stop/remove the container; and assert the named container is
  absent.
- Once the proof runner starts, caught failures write a JSON receipt and its
  `finally` path attempts cleanup while the process and runner remain alive.
  Pre-run setup failure, cancellation, runner loss or the 30-minute timeout may
  be artifact-less; those terminal outcomes are evidenced only by GitHub status/
  logs and ephemeral-runner teardown, never relabeled as receipt-backed. A
  successful receipt hashes Dockerfile and lockfile and records the private commit/run,
  runner image/version, Docker client/server versions, image identity, audit
  results, timings, memory, stop result and residual-container count. It never
  writes tokens or environment dumps.
- The only upload candidate is
  `artifacts/gate0-container-proof/receipt.json`. Every captured log/stdout/stderr
  field is truncated to at most 65,536 UTF-8 bytes. Before writing, the runner
  serializes the complete receipt and enforces a 1,048,576-byte ceiling. If the
  ceiling is exceeded it removes/refuses the file and fails, so the upload step
  finds no candidate and GitHub status/logs are the only evidence.
- Add one npm command and syntax check; no new dependency or generalized CI
  framework.
- Estimated delta: about 250 lines of bounded orchestration plus package wiring.
- Why a new script is justified: no current module owns container lifecycle;
  putting it in YAML would duplicate verifier logic and make cleanup/evidence
  difficult to test and review.

### p3 — Add one manual, bounded private workflow

- Add `.github/workflows/gate0-container-proof.yml` with only
  `workflow_dispatch`, `permissions: contents: read`, one `ubuntu-24.04`
  standard job, a 30-minute timeout, and concurrency that does not create
  parallel duplicate Gate 0 runs.
- Pin `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` to
  the exact commits recorded in
  `docs/planning/evidence/github-actions-gate0-boundary.json`; checkout must not
  persist credentials.
- Run `npm ci`, syntax/boundary checks, install only Playwright Chromium plus its
  Linux dependencies, then invoke the proof runner. Upload only the small proof
  receipt file with one-day retention, `if: always()` and missing-file ignore.
  The file's enforced 1 MiB ceiling remains below the required 10 MiB artifact
  headroom. Do not cache, publish an image, deploy, expose secrets or run on
  push/pull request.
- Estimated delta: about 60 YAML lines.
- Why one job: build, container runtime and receipt must share one ephemeral
  Docker daemon; splitting jobs would require an image registry and broaden the
  contract.

### p4 — Extend existing boundary and source manifests

- Update `scripts/check-boundary.mjs` to scan workflow `.yml`, assert manual-only
  trigger, standard runner, timeout, read-only permission, exact action pins,
  credential non-persistence, one-day artifact retention, and absence of push,
  registry/deployment or paid-runner configuration.
- Update `scripts/generate-local-proof.mjs` source inventory with the proof
  runner and workflow, but keep local proof explicitly separate from the future
  CI receipt.
- Update `package.json` syntax/proof command wiring.
- Estimated delta: about 45 lines across three existing files.
- Why extend in place: these files already own the standalone source boundary
  and proof source manifest.

### p5 — Push, trigger, retrieve and close the real boundary

- Before push, run syntax, boundary, 17-test regression, native Chrome WebMCP,
  local external-origin verification and bounded workflow structural assertions,
  specialist code review and focused critic.
- Commit only the authorized private challenge files. Immediately before the
  normal non-force push, create an immutable local preflight receipt proving:
  configured `origin` is exactly
  `https://github.com/NSPbuilder/savs-webmcp-challenge.git`; local branch and
  remote default branch are `main`; remote `main` still equals
  `ea86af67d9b073003e15076b730c664b7c77cbda`; GitHub still reports the repository
  private; Actions remains enabled; remote workflow inventory remains empty; the
  new local commit's sole parent is that baseline; and its changed-path set is
  exactly within the revision 2 current-state plus revision 5 authorized closure.
  Stop on any mismatch. Push only with `git push origin main`, never force, then
  re-read privacy, Actions permissions and the registered workflow.
- GitHub's successful registration of the pushed workflow is the YAML parse
  evidence; pre-push checks claim only bounded structural validation.
- Before triggering, verify at least 30 included Linux minutes and 10 MiB
  artifact headroom remain, or verify account controls that block all paid
  overage. If neither is observable, stop and request user direction without
  triggering or changing billing.
- Trigger exactly one workflow with `gh workflow run ... --ref main`; identify
  the run by workflow, branch and pushed SHA; watch it to a terminal conclusion.
- Any terminal workflow outcome exhausts this revision's one-run authorization.
  On failure, retrieve whatever logs/artifacts exist and stop; any correction,
  subsequent push or second `workflow_dispatch` requires renewed explicit user
  authorization and a fresh allowance/overage-control check. Do not change
  billing/settings or retry on a paid runner.
- On PASS, download the named artifact, validate JSON, require the receipt commit
  and Dockerfile/lockfile hashes to match the pushed source, and copy it
  create-once into revision 5 evidence before completion/result audits.
- On FAIL, download available diagnostics and record the first causal failure,
  then stop. Do not implement a correction or trigger again under this
  authorization; a correction requires a newly authorized plan revision.

## Step 5 — Acceptance bar

### p1 acceptance — contract and boundary

- Revision 5 immutable snapshot receives a normal critic clean PASS and a
  bounded proportionality `PROCEED` contract before implementation.
- The contract authorizes only the private workflow, proof runner, manifest and
  documentation paths named here plus revisioned evidence.
- Revisions 2-4 remain byte-unchanged. The bounded contract hashes the complete
  authorized target set and named protected invariants and freezes new-file
  absences without scanning outside `savs-webmcp-challenge`.

### p2 acceptance — proof runner

- `node --check scripts/run-gate0-container-proof.mjs` passes.
- Static review confirms every Docker invocation uses an argument array, no
  token/environment dump is written, caught in-process failures write a receipt,
  and `finally` attempts bounded removal while the process remains alive.
- Real CI receipt contains `status: "passed"`, exact source hashes, Docker
  client/server versions, image ID/OS/architecture/size, cold-start time,
  external verifier result, cgroup peak bytes, post-audit process assertion,
  successful stop and zero residual named containers.
- Every stored log/stdout/stderr field is at most 65,536 UTF-8 bytes and the only
  artifact candidate, serialized `receipt.json`, is at most 1,048,576 bytes. An
  over-limit receipt is absent and cannot be uploaded.

### p3 acceptance — workflow

- Pre-push bounded assertions prove `workflow_dispatch` only,
  `contents: read`, `ubuntu-24.04`, 30-minute timeout, exact action SHAs,
  `persist-credentials: false`, no cache/registry/deployment, exact receipt-file
  upload, one-day retention, missing-file ignore and no secret-bearing environment.
- GitHub successfully registers the workflow on private `main`, providing the
  actual YAML parse evidence. Immediately before the normal non-force push, the
  immutable preflight proves exact origin/private/default branch/remote baseline/
  Actions/no-conflicting-workflow/local-parent/authorized-path closure. Exactly
  one authorized run is associated with the pushed SHA and reaches `success`
  without paid-setting changes.

### p4 acceptance — regression and manifests

- `npm run check:format`, `npm run check:boundary`, `npm test`,
  `npm run check:webmcp` and a local independent-origin
  `npm run verify:deployment` all pass before push.
- The boundary scanner includes `.github/workflows/gate0-container-proof.yml`
  and `scripts/run-gate0-container-proof.mjs` and still reports zero private
  runtime imports and zero absolute workspace paths.
- The local proof source manifest includes both new source files; it does not
  claim the CI runtime passed before the downloaded receipt exists.

### p5 acceptance — real Linux evidence and cleanup

- Downloaded artifact hashes and receipt fields bind the private repository,
  exact pushed commit, Dockerfile, lockfile, workflow run ID/attempt and runner
  OS/image/architecture.
- External verifier proves distinct sessions/reset isolation, R1 fresh BLOCK
  with PNGs, real R1-to-R2 stale BLOCK, R2 fresh PASS with PNGs, two concurrently
  issued audit outcomes and the visible-control chain through the container's
  mapped origin.
- Receipt records peak container memory and individual/combined audit latency
  without claiming server intervals that were not instrumented.
- After verification there is no Chrome/Chromium child left in the container;
  after stop the named container count is zero.
- A bounded completion-integrity audit inventories only the revision 5
  authorized targets, named protected invariants and create-once copied CI
  receipt. It records a pre-critic result hash set, runs the focused critic,
  repeats the identical scoped scan and requires byte equality before Gate 0 is
  called complete. No NSP-root scan or second critic installation is permitted.
- Before that single run, remaining included minutes/artifact headroom or a
  zero-overage control is evidenced. Any terminal attempt exhausts the current
  trigger authorization; failure stops the revision even if no receipt exists.

## Explicit non-goals

- Local Docker Desktop, Colima or other runtime installation.
- Paid runner, billing/budget/payment change, workflow cache, image registry or
  package publication.
- Hosting provider selection, public HTTPS deployment, availability monitoring,
  authentication, database, queue or persistent customer state.
- Repository visibility or license change, public source, YouTube, Devpost or
  Challenge submission mutation.
- `nsp-savs`, `nsp-core` or SAVS algorithm changes.
- Treating CI evidence as hosted-origin, ChatGPT in-app-browser, public judge or
  final submission evidence.

## Authorized targets

- `.github/workflows/gate0-container-proof.yml`
- `scripts/run-gate0-container-proof.mjs`
- `scripts/check-boundary.mjs`
- `scripts/generate-local-proof.mjs`
- `package.json`
- `README.md`
- `docs/deployment-plan.md`
- `docs/planning/webmcp-gate0-ci-mini-design.md`
- `docs/planning/evidence/github-actions-gate0-boundary.json`
- revision 5 bounded execution-integrity plan/audit/contract/evidence records
- the already-authorized unpushed revision 2 implementation paths, solely for
  committing and pushing their current tested state; they may not be modified by
  revision 5 except where separately listed above.

## Residual risks and promotion triggers

- GitHub quota/billing visibility remains unavailable. A quota/payment block is
  a stop condition, not permission to alter billing or use a paid runner. If
  included headroom or zero-overage controls cannot be verified before trigger,
  user direction is required.
- The standard runner proves only its actual architecture and Docker/runtime
  version. A different public host still requires its own full verifier run.
- If the Playwright image plus host verifier exceeds runner disk/time, record the
  measured failure; do not enlarge the runner, add caches or purchase capacity
  without a new decision.
- If cgroup peak memory is unavailable on the runner, fail the receipt rather
  than replacing it with an unlabelled point-in-time statistic.
- Any need for a registry, reusable deployment workflow, secrets, scheduled CI
  or public artifact requires a new authorized revision.
- Standard execution-integrity whole-project tooling remains unavailable inside
  this subproject and prohibited at NSP root. The bounded authorized-path audit
  is the assurance limit for this revision.
