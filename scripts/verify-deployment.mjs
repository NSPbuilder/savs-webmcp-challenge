import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { chromium } from 'playwright';

const rawOrigin = process.env.TARGET_ORIGIN;
assert.ok(rawOrigin, 'TARGET_ORIGIN is required');
const target = new URL(rawOrigin);
assert.ok(['http:', 'https:'].includes(target.protocol), 'TARGET_ORIGIN must use http or https');
target.pathname = '/';
target.search = '';
target.hash = '';
const origin = target.href.replace(/\/$/, '');

async function contextWithWebMcp(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    const registered = [];
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        async registerTool(tool) { registered.push(tool); },
        async getTools() {
          return registered
            .map(({ execute: _execute, ...tool }) => tool)
            .sort((left, right) => left.name.localeCompare(right.name));
        },
        async executeTool(tool, jsonArguments) {
          if (typeof jsonArguments !== 'string') throw new TypeError('Arguments must be JSON text');
          const name = typeof tool === 'string' ? tool : tool.name;
          const registeredTool = registered.find((candidate) => candidate.name === name);
          if (!registeredTool) throw new Error(`Unknown tool ${name}`);
          return JSON.stringify(await registeredTool.execute(JSON.parse(jsonArguments)));
        },
      },
    });
  });
  return context;
}

async function execute(page, name, args = {}) {
  const envelope = await page.evaluate(
    async ({ toolName, argumentsValue }) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Missing tool ${toolName}`);
      const serialized = await document.modelContext.executeTool(
        tool,
        JSON.stringify(argumentsValue),
      );
      if (typeof serialized !== 'string') throw new TypeError('Tool result must be serialized JSON');
      return JSON.parse(serialized);
    },
    { toolName: name, argumentsValue: args },
  );
  return JSON.parse(envelope.content[0].text);
}

async function openToolPage(context) {
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByText('4 WebMCP tools available').waitFor();
  return page;
}

async function timed(operation) {
  const startedAt = performance.now();
  const result = await operation();
  return { result, latencyMs: Math.round(performance.now() - startedAt) };
}

async function assertPng(path) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^image\/png\b/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 8);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return bytes.length;
}

async function compact(page, prefix) {
  return execute(page, 'apply_compact_layout', {
    idempotencyKey: `${prefix}-${randomUUID()}`,
  });
}

async function audit(page, revisionId, prefix) {
  return execute(page, 'run_visual_audit', {
    revisionId,
    auditId: `${prefix}-${randomUUID()}`,
  });
}

const rootResponse = await fetch(origin);
assert.equal(rootResponse.status, 200);
assert.match(rootResponse.headers.get('content-type') || '', /^text\/html\b/);
assert.match(await rootResponse.text(), /SAVS Optical Verification Bench/);

const browser = await chromium.launch({ headless: true });
try {
  const [contextA, contextB] = await Promise.all([
    contextWithWebMcp(browser),
    contextWithWebMcp(browser),
  ]);
  const [pageA, pageB] = await Promise.all([
    openToolPage(contextA),
    openToolPage(contextB),
  ]);

  const expectedTools = [
    'apply_alignment_repair',
    'apply_compact_layout',
    'get_visual_state',
    'run_visual_audit',
  ];
  assert.deepEqual(
    await pageA.evaluate(async () => (await document.modelContext.getTools()).map((tool) => tool.name)),
    expectedTools,
  );

  const [initialA, initialB] = await Promise.all([
    execute(pageA, 'get_visual_state'),
    execute(pageB, 'get_visual_state'),
  ]);
  assert.notEqual(initialA.application.sessionId, initialB.application.sessionId);
  assert.equal(initialA.application.currentRevisionId, 'R0');
  assert.equal(initialB.application.currentRevisionId, 'R0');

  assert.equal((await compact(pageA, 'deploy-a')).revision.revisionId, 'R1');
  assert.equal((await execute(pageB, 'get_visual_state')).application.currentRevisionId, 'R0');
  assert.equal(await pageA.locator('[data-current-revision]').textContent(), 'R1');
  assert.equal(await pageB.locator('[data-current-revision]').textContent(), 'R0');

  const r1Timed = await timed(() => audit(pageA, 'R1', 'deploy-r1'));
  const r1 = r1Timed.result;
  assert.equal(r1.freshness, 'fresh');
  assert.equal(r1.verdict, 'BLOCK');
  assert.ok(r1.comparison.changedPixels > 0);
  assert.equal(r1.comparison.outsideTargetPixels, 0);
  assert.equal(r1.stableControl.changedPixels, 0);
  const r1EvidenceBytes = {};
  for (const [name, path] of Object.entries(r1.artifacts)) {
    r1EvidenceBytes[name] = await assertPng(path);
  }

  const repair = await execute(pageA, 'apply_alignment_repair', {
    idempotencyKey: `deploy-repair-${randomUUID()}`,
    expectedRevisionId: 'R1',
  });
  assert.equal(repair.revision.revisionId, 'R2');
  const staleUiState = await execute(pageA, 'get_visual_state');
  assert.equal(staleUiState.audit.auditedRevisionId, 'R1');
  assert.equal(staleUiState.audit.currentRevisionId, 'R2');
  assert.equal(staleUiState.audit.freshness, 'stale');
  assert.equal(staleUiState.audit.verdict, 'BLOCK');

  const r2Timed = await timed(() => audit(pageA, 'R2', 'deploy-r2'));
  assert.equal(r2Timed.result.freshness, 'fresh');
  assert.equal(r2Timed.result.verdict, 'PASS');
  assert.equal(r2Timed.result.comparison.changedPixels, 0);
  assert.equal(r2Timed.result.stableControl.changedPixels, 0);
  const r2EvidenceBytes = {};
  for (const [name, path] of Object.entries(r2Timed.result.artifacts)) {
    r2EvidenceBytes[name] = await assertPng(path);
  }

  await compact(pageB, 'deploy-b');
  await pageB.locator('[data-action="reset"]').click();
  await pageB.getByText('Reset complete.').waitFor();
  assert.equal((await execute(pageB, 'get_visual_state')).application.currentRevisionId, 'R0');
  assert.equal((await execute(pageA, 'get_visual_state')).application.currentRevisionId, 'R2');

  await pageA.locator('[data-action="reset"]').click();
  await pageA.getByText('Reset complete.').waitFor();
  await compact(pageA, 'stale-race');
  const staleAuditPromise = audit(pageA, 'R1', 'stale-race-audit');
  await pageA.waitForTimeout(50);
  const staleRaceRepair = await execute(pageA, 'apply_alignment_repair', {
    idempotencyKey: `stale-race-repair-${randomUUID()}`,
    expectedRevisionId: 'R1',
  });
  assert.equal(staleRaceRepair.revision.revisionId, 'R2');
  const staleAuditReceipt = await staleAuditPromise;
  assert.equal(staleAuditReceipt.auditedRevisionId, 'R1');
  assert.equal(staleAuditReceipt.currentRevisionId, 'R2');
  assert.equal(staleAuditReceipt.freshness, 'stale');
  assert.equal(staleAuditReceipt.verdict, 'BLOCK');

  await pageA.locator('[data-action="reset"]').click();
  await pageA.getByText('Reset complete.').waitFor();
  await Promise.all([compact(pageA, 'concurrent-a'), compact(pageB, 'concurrent-b')]);
  const concurrentStartedAt = performance.now();
  const [concurrentA, concurrentB] = await Promise.all([
    audit(pageA, 'R1', 'concurrent-audit-a'),
    audit(pageB, 'R1', 'concurrent-audit-b'),
  ]);
  const concurrentLatencyMs = Math.round(performance.now() - concurrentStartedAt);
  assert.equal(concurrentA.verdict, 'BLOCK');
  assert.equal(concurrentB.verdict, 'BLOCK');

  const visibleContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const visiblePage = await visibleContext.newPage();
  await visiblePage.goto(origin, { waitUntil: 'networkidle' });
  await visiblePage.getByText('WebMCP unavailable · visible controls active').waitFor();
  await visiblePage.locator('[data-action="compact"]').click();
  await visiblePage.getByText('Compact action complete.').waitFor();
  await visiblePage.locator('[data-action="audit"]').click();
  await visiblePage.getByText('Visual audit complete.').waitFor();
  assert.equal(await visiblePage.locator('[data-verdict-label]').textContent(), 'BLOCK');
  await visiblePage.locator('[data-action="repair"]').click();
  await visiblePage.getByText('Alignment repair complete.').waitFor();
  assert.equal(await visiblePage.locator('[data-freshness]').textContent(), 'stale');
  await visiblePage.locator('[data-action="audit"]').click();
  await visiblePage.getByText('Visual audit complete.').waitFor();
  assert.equal(await visiblePage.locator('[data-verdict-label]').textContent(), 'PASS');

  console.log(JSON.stringify({
    ok: true,
    boundary: 'external origin through Playwright WebMCP-compatible harness and visible controls',
    origin,
    hostBrowser: browser.version(),
    tools: expectedTools,
    sessionsDistinct: true,
    resetIsolation: true,
    r1: {
      verdict: r1.verdict,
      freshness: r1.freshness,
      changedPixels: r1.comparison.changedPixels,
      outsideTargetPixels: r1.comparison.outsideTargetPixels,
      stableControlPixels: r1.stableControl.changedPixels,
      auditLatencyMs: r1Timed.latencyMs,
      evidenceBytes: r1EvidenceBytes,
    },
    stale: {
      proof: 'server audit completed after the audited session advanced',
      auditedRevisionId: staleAuditReceipt.auditedRevisionId,
      currentRevisionId: staleAuditReceipt.currentRevisionId,
      freshness: staleAuditReceipt.freshness,
      verdict: staleAuditReceipt.verdict,
    },
    r2: {
      verdict: r2Timed.result.verdict,
      freshness: r2Timed.result.freshness,
      changedPixels: r2Timed.result.comparison.changedPixels,
      auditLatencyMs: r2Timed.latencyMs,
      evidenceBytes: r2EvidenceBytes,
    },
    concurrentlyIssuedAudits: {
      count: 2,
      verdicts: [concurrentA.verdict, concurrentB.verdict],
      latencyMs: concurrentLatencyMs,
    },
    visibleControls: 'R1 BLOCK, stale after repair, fresh R2 PASS',
  }));
} finally {
  await browser.close();
}
