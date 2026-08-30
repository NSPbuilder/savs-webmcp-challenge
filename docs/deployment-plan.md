# SAVS WebMCP — Minimal Deployment Packaging Plan

Status: planning only. This document does not authorize or perform deployment, repository publication, license selection, YouTube upload, or Devpost mutation.

## Objective

Produce the smallest browser-capable deployment of the existing standalone Node.js application so a fresh judge can execute the complete R0 → R1 → BLOCK → stale → R2 → PASS chain through a public HTTPS URL.

The deployment must remain free and unrestricted to judges through 2026-09-21 at 5:00 p.m. PT.

## Current deployment-relevant substrate

- `server.mjs` serves the application, specimen pages, API routes, and content-addressed PNG evidence from one Node process.
- The server honors `HOST` and `PORT`; the current defaults are `127.0.0.1:4173`.
- `verifier/controlled-renderer.mjs` launches Playwright Chromium for every audit.
- Application revisions, action receipts, audit receipts, and image bytes are in memory.
- Restarting the process resets all sessions, which is acceptable for a resettable judge demo.
- Each top-level page now creates one opaque browser session ID, and the two-context E2E proves independent mutation and reset behavior.
- A digest-pinned Playwright container definition, external-origin verifier, bounded proof runner, and manual private GitHub Actions workflow now exist. The real Linux receipt remains pending until that workflow passes.

## Frozen approach

Use one small containerized Node service with a Playwright-supported Linux browser runtime. Do not split the application, introduce a database, create a queue, or move verification to another service unless the bounded container proof fails for a directly measured reason.

Do not select or pay for a hosting provider before the private CI container gate passes.

## Minimum future implementation surface

The later deployment implementation should be limited to:

1. A pinned container build file using a Node/Playwright-compatible Linux base.
2. A `.dockerignore` excluding `.git`, `node_modules`, local proof artifacts, and private development state.
3. A provider-neutral start contract:
   - `HOST=0.0.0.0`;
   - `PORT` supplied by the platform;
   - `npm start` as the only service command.
4. Per-page judge session isolation in `app/app.js`, using an opaque browser-generated session ID retained for the page session. WebMCP tools and visible controls must use that same isolated ID.
5. Focused tests proving two independent browser contexts cannot observe or advance each other's R0/R1/R2 chain.
6. A deployment smoke script or documented command that exercises the public URL without credentials.
7. Provider configuration only after the container and session-isolation gates pass.

No private `nsp-savs` file, report, package, credential, or absolute development-machine path may enter the image.

## Gate 0 — private ephemeral Linux container proof

Manually dispatch the private `Gate 0 container proof` workflow against the exact pushed `main`
commit. The standard Ubuntu runner builds and runs the candidate image without installing a local
container runtime. Before triggering, verify sufficient included Actions minutes/artifact headroom
or account controls that block paid overage; do not alter billing or select a paid runner. PASS
requires:

- image builds from a clean package installation;
- service binds the supplied `HOST` and `PORT`;
- `/` returns the product page;
- Playwright Chromium launches inside the container without manual intervention;
- one complete visual audit publishes reference/current/difference images;
- the full R0/R1/BLOCK/stale/R2/PASS chain succeeds;
- two simultaneous browser contexts receive distinct application sessions;
- reset in one context does not modify the other context;
- visible controls still work without WebMCP;
- the receipt binds the private commit, Dockerfile and lockfile hashes, workflow run, runner, Docker versions, image identity/architecture, audit latency and cgroup peak memory;
- every captured log field is at most 65,536 bytes and the only upload candidate is a receipt no larger than 1 MiB;
- no Chromium child remains after the audits;
- container shutdown leaves no child browser process running.

Failure to launch Chromium, isolate sessions, or complete an audit stops deployment. It does not justify renting a larger server or changing architecture until the exact failure and measured resource requirement are known.

One terminal workflow attempt exhausts the current run authorization. A failure, cancellation,
timeout, quota/payment block or artifact-less runner loss stops this revision; another push or
workflow dispatch requires renewed user authorization.

## Gate 1 — hosting selection

Choose a provider only if it supports:

- a long-running container or equivalent browser-capable process;
- Playwright Chromium and required Linux libraries;
- an externally supplied `PORT` and public HTTPS routing;
- sufficient memory for at least one audit plus one concurrent page session;
- a stable URL through the end of judging;
- basic service logs and restart visibility;
- free judge access without geographic or account restrictions.

Static-only hosting is not sufficient for the current architecture. A serverless target is acceptable only if a measured deployment probe proves that browser startup, audit duration, response limits, and in-memory revision behavior all work without changing the product claim.

The official rules permit ChatGPT Sites, Cloudflare, Vercel, Render, Netlify, or another provider. That list is permission, not evidence that every listed product can run this Playwright service unchanged.

## Gate 2 — hosted functional proof

Against the HTTPS staging URL:

- open two clean browser contexts and prove session isolation;
- run the visible-control flow without WebMCP;
- run all four registered tools in WebMCP-enabled Chrome;
- verify the live receipt fields rather than copying local metrics;
- confirm evidence image URLs load and remain bound to the correct audit;
- confirm stale R1 evidence cannot certify R2;
- reload and reset without requiring credentials;
- record browser version, latency for both audits, and non-sensitive outcome fields.

A local proof report does not satisfy this gate.

## Gate 3 — optional ChatGPT boundary

If the ChatGPT desktop in-app browser is available, repeat the clean-session tool discovery and complete chain there. Record it as a separate boundary.

- A successful Chrome run must not be relabeled as ChatGPT evidence.
- Failure or unavailability in ChatGPT does not erase a valid WebMCP-enabled Chrome live run, because the official rules allow judges to use either boundary.
- The final text and video must name the boundary actually observed.

## Gate 4 — publication and judging availability

Only after hosted proof and user review:

- add the selected open-source license;
- verify the public repository contains every required source file, asset, dependency instruction, and deployment instruction;
- have the user manually change repository visibility to public;
- verify the license is detectable and visible on the repository page;
- place the final live, repository, video, and testing URLs into the submission draft;
- keep the live service available free of charge and without restriction until 2026-09-21 at 5:00 p.m. PT;
- retain a simple daily availability check during the judging period without changing judge data or application state.

## Resource and reliability questions to measure, not guess

- cold browser startup time inside the candidate image;
- peak memory during one audit;
- behavior with two overlapping audits;
- evidence memory released by reset or bounded session retirement;
- host restart and cold-start time;
- platform request timeout versus measured audit latency.

The first container probe should answer these questions. Do not size or purchase infrastructure from assumptions.

## Rollback and containment

- Deployment work remains inside `savs-webmcp-challenge`.
- Private `nsp-savs` remains unchanged and is never a runtime dependency.
- The hosted service uses synthetic fixture state only.
- If the staging proof fails, stop the service and retain the private repository and local proof as the last known-good boundary.
- No public repository or Devpost field changes occur until the user approves the publication gate.

## Evidence required before calling deployment complete

- private CI container build and source-bound full-chain receipt;
- two-context session-isolation test;
- hosted HTTPS full-chain receipt;
- WebMCP-enabled Chrome live tool-discovery and execution receipt;
- optional, separately labeled ChatGPT in-app-browser receipt;
- public repository/license/instructions check after user publication;
- availability plan extending through the judging deadline.

## Explicit non-goals

- SAVS core changes;
- a general visual-audit service;
- a persistent customer database;
- accounts, payments, or authentication;
- multi-region or multi-browser production infrastructure;
- model training or learned perception;
- publication or external deployment during this planning node.
