import { chromium } from 'playwright';

import { comparePngBuffers, serializableComparison } from './reference-diff.mjs';

const VIEWPORT = Object.freeze({ width: 760, height: 240 });
const DEVICE_SCALE_FACTOR = 2;
const TARGET_IDS = Object.freeze(['css-value', 'device-value']);

function artifact(result, name, bytes) {
  const buffer = Buffer.from(bytes);
  result.artifacts[name] = buffer;
  return buffer;
}

async function capture(page) {
  await page.waitForFunction(() => document.fonts?.status === 'loaded');
  return page.screenshot({ animations: 'disabled', type: 'png' });
}

async function registeredTargets(page) {
  const targets = [];
  for (const id of TARGET_IDS) {
    const box = await page.locator(`[data-audit-target="${id}"]`).boundingBox();
    if (!box) throw new Error(`Audit target ${id} is not visible`);
    const x = Math.floor(box.x * DEVICE_SCALE_FACTOR);
    const y = Math.floor(box.y * DEVICE_SCALE_FACTOR);
    const right = Math.ceil((box.x + box.width) * DEVICE_SCALE_FACTOR);
    const bottom = Math.ceil((box.y + box.height) * DEVICE_SCALE_FACTOR);
    targets.push({ id, x, y, width: right - x, height: bottom - y });
  }
  return targets;
}

export async function runControlledRender({ origin, sessionId, revisionId }) {
  const browser = await chromium.launch({ headless: true });
  const result = { artifacts: {} };
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      locale: 'en-US',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const parameters = new URLSearchParams({ sessionId, revisionId });
    const referenceUrl = `${origin}/specimen?${parameters}&variant=reference`;
    const currentUrl = `${origin}/specimen?${parameters}&variant=current`;

    await page.goto(referenceUrl, { waitUntil: 'networkidle' });
    const targets = await registeredTargets(page);
    const referencePng = artifact(result, 'reference.png', await capture(page));
    const referenceAgainPng = artifact(result, 'reference-again.png', await capture(page));

    await page.goto(currentUrl, { waitUntil: 'networkidle' });
    const currentPng = artifact(result, 'current.png', await capture(page));
    const comparison = comparePngBuffers(referencePng, currentPng, { targets });
    const stableControl = comparePngBuffers(referencePng, referenceAgainPng, { targets });
    artifact(result, 'diff.png', comparison.diffPng);

    return {
      viewport: { ...VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR },
      targets,
      comparison: serializableComparison(comparison),
      stableControl: serializableComparison(stableControl),
      artifacts: result.artifacts,
    };
  } finally {
    await browser.close();
  }
}
