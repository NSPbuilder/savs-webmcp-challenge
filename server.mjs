import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { RevisionStore, StoreError } from './lib/store.mjs';
import { stableClone, stableJson } from './lib/stable-json.mjs';
import { runControlledRender } from './verifier/controlled-renderer.mjs';
import { sha256 } from './verifier/png.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function json(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function text(response, status, body, contentType = 'text/plain; charset=utf-8') {
  const payload = Buffer.from(body);
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': payload.length,
    'cache-control': 'no-store',
  });
  response.end(payload);
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new StoreError('INVALID_ARGUMENT', 'JSON body is too large');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new StoreError('INVALID_ARGUMENT', 'Request body must be valid JSON');
  }
}

function errorStatus(error) {
  if (!(error instanceof StoreError)) return 500;
  if (
    ['AUDIT_ID_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_TRANSITION', 'REVISION_CONFLICT'].includes(
      error.code,
    )
  ) return 409;
  if (error.code === 'REVISION_NOT_FOUND') return 404;
  return 400;
}

function errorBody(error) {
  if (error instanceof StoreError) {
    return { error: { code: error.code, message: error.message, details: error.details } };
  }
  return { error: { code: 'INTERNAL_ERROR', message: error.message } };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function specimenHtml(revision, variant) {
  const isReference = variant === 'reference';
  const offset = isReference ? 0 : revision.tokens.metricBaselineOffset;
  const density = revision.tokens.layoutDensity;
  const cardGap = density === 'compact' ? 12 : 24;
  const cardPadding = density === 'compact' ? 16 : 24;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Registered specimen ${escapeHtml(revision.revisionId)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
    body { background: #f4f5f0; color: #171a18; font-family: Arial, Helvetica, sans-serif; }
    main { height: 240px; padding: 22px 28px; display: grid; grid-template-rows: auto 1fr; gap: 18px; }
    .kicker { margin: 0; font: 700 11px/1.1 "Courier New", monospace; letter-spacing: .16em; text-transform: uppercase; color: #58605a; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${cardGap}px; }
    .card { border: 1px solid #aeb5ae; padding: ${cardPadding}px; background: #fbfcf8; display: grid; align-content: center; }
    .label { margin: 0 0 15px; font: 700 10px/1 "Courier New", monospace; letter-spacing: .14em; text-transform: uppercase; color: #58605a; }
    .metric { display: inline-flex; align-items: baseline; width: max-content; min-height: 45px; font-variant-numeric: tabular-nums; }
    .number { position: relative; top: ${offset}px; font: 700 42px/1 Arial, Helvetica, sans-serif; }
    .unit { margin-left: 10px; font: 700 24px/1 Arial, Helvetica, sans-serif; }
  </style>
</head>
<body>
  <main data-revision="${escapeHtml(revision.revisionId)}" data-variant="${escapeHtml(variant)}">
    <p class="kicker">Controlled optical specimen · ${escapeHtml(density)} layout</p>
    <section class="cards" aria-label="Registered measurements">
      <article class="card">
        <p class="label">Defect</p>
        <div class="metric" data-audit-target="css-value"><span class="number">2</span><span class="unit">CSS px</span></div>
      </article>
      <article class="card">
        <p class="label">At DPR 2</p>
        <div class="metric" data-audit-target="device-value"><span class="number">4</span><span class="unit">device px</span></div>
      </article>
    </section>
  </main>
</body>
</html>`;
}

export async function startServer({
  host = '127.0.0.1',
  port = 0,
  store = new RevisionStore(),
  auditDelayMs = 0,
} = {}) {
  const evidence = new Map();
  const auditReceipts = new Map();
  let origin = null;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin ?? `http://${host}`);
      if (request.method === 'GET' && APP_FILES.has(url.pathname)) {
        const [name, contentType] = APP_FILES.get(url.pathname);
        text(response, 200, await readFile(join(ROOT, 'app', name), 'utf8'), contentType);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/specimen') {
        const sessionId = url.searchParams.get('sessionId') || 'demo';
        const revisionId = url.searchParams.get('revisionId');
        const variant = url.searchParams.get('variant');
        if (!['reference', 'current'].includes(variant)) {
          throw new StoreError('INVALID_ARGUMENT', 'variant must be reference or current');
        }
        const revision = store.getRevision(sessionId, revisionId);
        text(response, 200, specimenHtml(revision, variant), 'text/html; charset=utf-8');
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        json(response, 200, store.getState(url.searchParams.get('sessionId') || 'demo'));
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/evidence/')) {
        const found = evidence.get(url.pathname);
        if (!found) {
          json(response, 404, { error: { code: 'EVIDENCE_NOT_FOUND', message: 'Unknown evidence artifact' } });
          return;
        }
        response.writeHead(200, {
          'content-type': 'image/png',
          'content-length': found.length,
          'cache-control': 'no-store',
        });
        response.end(found);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/reset') {
        const body = await bodyJson(request);
        const sessionId = body.sessionId || 'demo';
        for (const key of auditReceipts.keys()) {
          if (key.startsWith(`${sessionId}\u0000`)) auditReceipts.delete(key);
        }
        json(response, 200, store.reset(sessionId));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/actions/compact') {
        json(response, 200, store.applyCompactLayout(await bodyJson(request)));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/actions/repair') {
        json(response, 200, store.applyAlignmentRepair(await bodyJson(request)));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/audits') {
        const body = await bodyJson(request);
        const sessionId = body.sessionId || 'demo';
        const auditedRevision = store.getRevision(sessionId, body.revisionId);
        const auditId = typeof body.auditId === 'string' && body.auditId ? body.auditId : randomUUID();
        const receiptKey = `${sessionId}\u0000${auditId}`;
        const fingerprint = stableJson({ sessionId, revisionId: auditedRevision.revisionId });
        const existing = auditReceipts.get(receiptKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            throw new StoreError(
              'AUDIT_ID_CONFLICT',
              `Audit id ${auditId} was already used for different arguments`,
              { auditId, sessionId },
            );
          }
          json(response, 200, stableClone(await existing.promise));
          return;
        }

        const promise = (async () => {
          if (auditDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, auditDelayMs));
          const rendered = await runControlledRender({
            origin,
            sessionId,
            revisionId: auditedRevision.revisionId,
          });
          const artifactUrls = {};
          for (const [name, bytes] of Object.entries(rendered.artifacts)) {
            const digest = sha256(bytes);
            const path = `/evidence/${digest}.png`;
            const prior = evidence.get(path);
            if (prior && !prior.equals(bytes)) throw new Error(`Evidence hash collision at ${path}`);
            if (!prior) evidence.set(path, Buffer.from(bytes));
            artifactUrls[name] = path;
          }
          const currentRevisionId = store.getState(sessionId).currentRevisionId;
          const freshness = currentRevisionId === auditedRevision.revisionId ? 'fresh' : 'stale';
          const visualPass =
            rendered.comparison.changedPixels === 0 &&
            rendered.comparison.outsideTargetPixels === 0 &&
            rendered.stableControl.changedPixels === 0;
          return {
            auditId,
            sessionId,
            auditedRevisionId: auditedRevision.revisionId,
            currentRevisionId,
            freshness,
            verdict: freshness === 'fresh' && visualPass ? 'PASS' : 'BLOCK',
            reason: freshness === 'stale'
              ? 'Evidence belongs to an older revision.'
              : visualPass
                ? 'Current and approved reference are pixel-identical.'
                : 'Current revision differs from the approved reference.',
            viewport: rendered.viewport,
            targets: rendered.targets,
            comparison: rendered.comparison,
            stableControl: rendered.stableControl,
            artifacts: artifactUrls,
          };
        })();
        auditReceipts.set(receiptKey, { fingerprint, promise });
        try {
          json(response, 200, stableClone(await promise));
        } catch (error) {
          if (auditReceipts.get(receiptKey)?.promise === promise) auditReceipts.delete(receiptKey);
          throw error;
        }
        return;
      }
      json(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found' } });
    } catch (error) {
      json(response, errorStatus(error), errorBody(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  origin = `http://${host}:${address.port}`;
  return {
    origin,
    store,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

const launchedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (launchedDirectly) {
  const instance = await startServer({
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 4173),
  });
  console.log(`SAVS WebMCP challenge running at ${instance.origin}`);
}
