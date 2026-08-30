import assert from 'node:assert/strict';
import test from 'node:test';

import { chromium } from 'playwright';

import { startServer } from '../server.mjs';

async function contextWithWebMcp(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
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
          if (typeof jsonArguments !== 'string') throw new TypeError('Arguments must be valid JSON text');
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

async function execute(page, name, args) {
  return page.evaluate(
    async ({ toolName, argumentsValue }) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      const serialized = await document.modelContext.executeTool(tool, JSON.stringify(argumentsValue));
      if (typeof serialized !== 'string') throw new TypeError('executeTool must return serialized JSON text');
      return JSON.parse(serialized);
    },
    { toolName: name, argumentsValue: args },
  );
}

test('top-level imperative WebMCP tools execute the complete visual flow', { timeout: 60_000 }, async (t) => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await server.close();
  });
  const context = await contextWithWebMcp(browser, { width: 1280, height: 720 });
  const page = await context.newPage();
  await page.goto(server.origin, { waitUntil: 'networkidle' });
  await page.getByText('4 WebMCP tools available').waitFor();

  assert.equal(await page.evaluate(() => document.modelContext.getTools() instanceof Promise), true);
  const names = await page.evaluate(async () => (await document.modelContext.getTools()).map((tool) => tool.name));
  assert.deepEqual(names, [
    'apply_alignment_repair',
    'apply_compact_layout',
    'get_visual_state',
    'run_visual_audit',
  ]);
  assert.equal(new Set(names).size, 4);

  const compact = await execute(page, 'apply_compact_layout', { idempotencyKey: 'webmcp-compact' });
  assert.equal(JSON.parse(compact.content[0].text).revision.revisionId, 'R1');
  const r1Audit = await execute(page, 'run_visual_audit', { revisionId: 'R1', auditId: 'webmcp-r1' });
  const r1 = JSON.parse(r1Audit.content[0].text);
  assert.equal(r1.verdict, 'BLOCK');
  assert.ok(r1.comparison.changedPixels > 0);
  await page.getByText('BLOCK', { exact: true }).waitFor();

  const repair = await execute(page, 'apply_alignment_repair', {
    idempotencyKey: 'webmcp-repair',
    expectedRevisionId: 'R1',
  });
  assert.equal(JSON.parse(repair.content[0].text).revision.revisionId, 'R2');
  assert.equal(await page.locator('[data-current-revision]').textContent(), 'R2');
  assert.equal(await page.locator('[data-evidence-revision]').textContent(), 'R1');
  assert.equal(await page.locator('[data-freshness]').textContent(), 'stale');
  assert.equal(await page.locator('[data-verdict-label]').textContent(), 'BLOCK');
  const visualState = JSON.parse(
    (await execute(page, 'get_visual_state', {})).content[0].text,
  );
  assert.equal(visualState.audit.auditedRevisionId, 'R1');
  assert.equal(visualState.audit.currentRevisionId, 'R2');
  assert.equal(visualState.audit.freshness, 'stale');
  assert.equal(visualState.audit.verdict, 'BLOCK');
  const r2Audit = await execute(page, 'run_visual_audit', { revisionId: 'R2', auditId: 'webmcp-r2' });
  const r2 = JSON.parse(r2Audit.content[0].text);
  assert.equal(r2.verdict, 'PASS');
  assert.equal(r2.comparison.changedPixels, 0);
  await page.getByText('PASS', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-current-revision]').textContent(), 'R2');

  const alignment = await page.locator('.measurement-value').first().evaluate((element) => {
    const [number, unit] = element.children;
    const numberBox = number.getBoundingClientRect();
    const unitBox = unit.getBoundingClientRect();
    return { topDelta: Math.abs(numberBox.top - unitBox.top), bottomDelta: Math.abs(numberBox.bottom - unitBox.bottom) };
  });
  assert.ok(alignment.topDelta < 0.1 && alignment.bottomDelta < 0.1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.setViewportSize({ width: 390, height: 844 });
  const imageRender = await page.locator('.comparison-stack img').first().evaluate((image) => {
    const style = getComputedStyle(image);
    return {
      naturalRatio: image.naturalWidth / image.naturalHeight,
      objectFit: style.objectFit,
    };
  });
  assert.equal(imageRender.objectFit, 'contain');
  assert.ok(Math.abs(imageRender.naturalRatio - (19 / 6)) < 0.001);
});

test('visible controls remain available without WebMCP at desktop and mobile widths', { timeout: 30_000 }, async (t) => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await server.close();
  });
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(server.origin, { waitUntil: 'networkidle' });
    await page.getByText('WebMCP unavailable · visible controls active').waitFor();
    assert.equal(await page.locator('[data-action="compact"]').isVisible(), true);
    assert.equal(await page.locator('[data-action="audit"]').isVisible(), true);
    assert.equal(await page.locator('[data-action="repair"]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const tooWide = await page.locator('button').evaluateAll((buttons) =>
      buttons.some((button) => button.getBoundingClientRect().right > window.innerWidth + 0.5),
    );
    assert.equal(tooWide, false);
    await context.close();
  }
});
