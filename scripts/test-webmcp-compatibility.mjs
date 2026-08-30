import assert from 'node:assert/strict';

import { chromium } from 'playwright';

import { startServer } from '../server.mjs';

const server = await startServer();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-features=WebMCP,WebMCPTesting'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  await page.goto(server.origin, { waitUntil: 'networkidle' });
  await page.getByText('4 WebMCP tools available').waitFor();

  const outcome = await page.evaluate(async () => {
    const invoke = async (name, args) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === name);
      const serialized = await document.modelContext.executeTool(tool, JSON.stringify(args));
      if (typeof serialized !== 'string') throw new TypeError('executeTool must return serialized JSON text');
      return JSON.parse(JSON.parse(serialized).content[0].text);
    };
    const pendingTools = document.modelContext.getTools();
    const getToolsIsAsync = pendingTools instanceof Promise;
    const nativeModelContext = !Object.prototype.hasOwnProperty.call(document, 'modelContext');
    const names = (await pendingTools).map((tool) => tool.name);
    const compact = await invoke('apply_compact_layout', { idempotencyKey: 'compat-compact' });
    const blocked = await invoke('run_visual_audit', { revisionId: 'R1', auditId: 'compat-r1' });
    const repair = await invoke('apply_alignment_repair', {
      idempotencyKey: 'compat-repair',
      expectedRevisionId: 'R1',
    });
    const passed = await invoke('run_visual_audit', { revisionId: 'R2', auditId: 'compat-r2' });
    return { getToolsIsAsync, nativeModelContext, names, compact, blocked, repair, passed };
  });

  assert.equal(outcome.getToolsIsAsync, true);
  assert.equal(outcome.nativeModelContext, true);
  assert.deepEqual(outcome.names, [
    'apply_alignment_repair',
    'apply_compact_layout',
    'get_visual_state',
    'run_visual_audit',
  ]);
  assert.equal(new Set(outcome.names).size, 4);
  assert.equal(outcome.compact.revision.revisionId, 'R1');
  assert.equal(outcome.blocked.verdict, 'BLOCK');
  assert.ok(outcome.blocked.comparison.changedPixels > 0);
  assert.equal(outcome.repair.revision.revisionId, 'R2');
  assert.equal(outcome.passed.verdict, 'PASS');
  assert.equal(outcome.passed.comparison.changedPixels, 0);

  console.log(JSON.stringify({
    ok: true,
    boundary: 'native Chrome WebMCP',
    browser: browser.version(),
    enabledFeatures: ['WebMCP', 'WebMCPTesting'],
    apiPath: 'document.modelContext.registerTool/getTools/executeTool',
    tools: outcome.names,
    r1: {
      revisionId: outcome.blocked.auditedRevisionId,
      verdict: outcome.blocked.verdict,
      changedPixels: outcome.blocked.comparison.changedPixels,
      targetCandidates: outcome.blocked.comparison.targetCandidates,
      outsideTargetPixels: outcome.blocked.comparison.outsideTargetPixels,
    },
    r2: {
      revisionId: outcome.passed.auditedRevisionId,
      verdict: outcome.passed.verdict,
      changedPixels: outcome.passed.comparison.changedPixels,
    },
  }));
} finally {
  await browser.close();
  await server.close();
}
