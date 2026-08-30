import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { startServer } from '../server.mjs';
import { sha256 } from '../verifier/png.mjs';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUTPUT = join(ROOT, 'artifacts', 'local-proof');
const SOURCE_FILES = [
  '.gitignore',
  'README.md',
  'app/app.js',
  'app/index.html',
  'app/styles.css',
  'lib/stable-json.mjs',
  'lib/store.mjs',
  'package-lock.json',
  'package.json',
  'scripts/check-boundary.mjs',
  'scripts/generate-local-proof.mjs',
  'scripts/test-webmcp-compatibility.mjs',
  'server.mjs',
  'tests/e2e.test.mjs',
  'tests/png.test.mjs',
  'tests/reference-diff.test.mjs',
  'tests/server.test.mjs',
  'tests/store.test.mjs',
  'verifier/controlled-renderer.mjs',
  'verifier/png.mjs',
  'verifier/reference-diff.mjs',
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function dataUri(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

function commitId() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function post(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || `HTTP ${response.status}`);
  return payload;
}

async function execute(page, name, args) {
  const result = await page.evaluate(
    async ({ toolName, argumentsValue }) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((candidate) => candidate.name === toolName);
      const serialized = await document.modelContext.executeTool(tool, JSON.stringify(argumentsValue));
      if (typeof serialized !== 'string') throw new TypeError('executeTool must return serialized JSON text');
      return JSON.parse(serialized);
    },
    { toolName: name, argumentsValue: args },
  );
  return JSON.parse(result.content[0].text);
}

async function image(origin, path) {
  const response = await fetch(`${origin}${path}`);
  if (!response.ok) throw new Error(`Unable to retrieve ${path}`);
  return Buffer.from(await response.arrayBuffer());
}

async function sourceManifest() {
  return Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (path) => {
    const bytes = await readFile(join(ROOT, path));
    return [path, { sha256: sha256(bytes), bytes: bytes.length }];
  })));
}

await mkdir(OUTPUT, { recursive: true });
const server = await startServer({ auditDelayMs: 80 });
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

  const compact = await execute(page, 'apply_compact_layout', { idempotencyKey: 'proof-compact' });
  const r1Audit = await execute(page, 'run_visual_audit', { revisionId: 'R1', auditId: 'proof-r1' });
  assert.equal(r1Audit.verdict, 'BLOCK');
  const desktopBlock = await page.screenshot({ type: 'png' });

  const repair = await execute(page, 'apply_alignment_repair', {
    idempotencyKey: 'proof-repair',
    expectedRevisionId: 'R1',
  });
  const r2Audit = await execute(page, 'run_visual_audit', { revisionId: 'R2', auditId: 'proof-r2' });
  assert.equal(r2Audit.verdict, 'PASS');
  const desktopPass = await page.screenshot({ type: 'png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.verdict-panel').scrollIntoViewIfNeeded();
  const mobilePass = await page.screenshot({ type: 'png' });

  await post(server.origin, '/api/reset', { sessionId: 'stale-proof' });
  await post(server.origin, '/api/actions/compact', {
    sessionId: 'stale-proof',
    idempotencyKey: 'stale-compact',
  });
  const stalePromise = post(server.origin, '/api/audits', {
    sessionId: 'stale-proof',
    revisionId: 'R1',
    auditId: 'proof-stale-r1',
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await post(server.origin, '/api/actions/repair', {
    sessionId: 'stale-proof',
    idempotencyKey: 'stale-repair',
    expectedRevisionId: 'R1',
  });
  const staleAudit = await stalePromise;
  assert.equal(staleAudit.freshness, 'stale');
  assert.equal(staleAudit.verdict, 'BLOCK');

  const images = {
    'r1-reference.png': await image(server.origin, r1Audit.artifacts['reference.png']),
    'r1-current.png': await image(server.origin, r1Audit.artifacts['current.png']),
    'r1-diff.png': await image(server.origin, r1Audit.artifacts['diff.png']),
    'r2-current.png': await image(server.origin, r2Audit.artifacts['current.png']),
    'r2-diff.png': await image(server.origin, r2Audit.artifacts['diff.png']),
    'desktop-block.png': desktopBlock,
    'desktop-pass.png': desktopPass,
    'mobile-pass.png': mobilePass,
  };
  for (const [name, bytes] of Object.entries(images)) await writeFile(join(OUTPUT, name), bytes);

  const receipt = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: commitId(),
    sourceFiles: await sourceManifest(),
    runtime: { node: process.version, playwright: '1.62.1', browser: `Google Chrome ${browser.version()}` },
    webmcp: {
      boundary: 'native Chrome WebMCP',
      enabledFeatures: ['WebMCP', 'WebMCPTesting'],
      apiPath: 'document.modelContext.registerTool/getTools/executeTool',
      executeToolResult: 'serialized JSON text',
      tools: await page.evaluate(async () => (await document.modelContext.getTools()).map((tool) => tool.name)),
    },
    chronology: {
      compact: { from: compact.fromRevisionId, to: compact.revision.revisionId },
      blocked: { revision: r1Audit.auditedRevisionId, verdict: r1Audit.verdict },
      repair: { from: repair.fromRevisionId, to: repair.revision.revisionId },
      passed: { revision: r2Audit.auditedRevisionId, verdict: r2Audit.verdict },
    },
    r1: r1Audit,
    stale: staleAudit,
    r2: r2Audit,
    images: Object.fromEntries(Object.entries(images).map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: bytes.length }])),
  };
  await writeFile(join(OUTPUT, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SAVS WebMCP local proof</title>
<style>
  :root { --paper:#f4f5f0; --surface:#fbfcf8; --carbon:#171a18; --muted:#58605a; --rule:#c7cbc4; --cyan:#067c87; --red:#d34735; }
  * { box-sizing:border-box; } body { margin:0; color:var(--carbon); background:var(--paper); font-family:Arial,sans-serif; }
  header, main { width:min(1380px, calc(100% - 40px)); min-width:0; margin:auto; } header { padding:54px 0 30px; border-bottom:2px solid var(--carbon); }
  .kicker { color:var(--cyan); font:700 11px/1.2 "Courier New",monospace; letter-spacing:.15em; text-transform:uppercase; }
  h1 { max-width:940px; margin:12px 0 18px; font-size:clamp(40px,6vw,82px); line-height:.92; letter-spacing:-.06em; }
  header p:last-child { max-width:760px; color:var(--muted); font-size:17px; line-height:1.55; }
  main { padding:30px 0 64px; display:grid; gap:24px; } section { min-width:0; padding:22px; background:var(--surface); border:1px solid var(--rule); }
  h2 { margin:0 0 16px; font-size:24px; } h3 { margin:0 0 9px; } .metrics { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--rule); }
  .metric { padding:16px; border-right:1px solid var(--rule); } .metric:last-child { border:0; } .metric span { display:block; color:var(--muted); font:700 10px/1.2 "Courier New",monospace; text-transform:uppercase; }
  .metric strong { display:flex; align-items:baseline; margin-top:8px; font-size:28px; font-variant-numeric:tabular-nums; } .metric strong i { font:inherit; font-style:normal; }
  .flow { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; } .step { padding:14px; border-left:4px solid var(--cyan); background:#eef1ec; }
  .step.block { border-color:var(--red); } .step small { display:block; margin-top:5px; color:var(--muted); font:700 10px/1.3 "Courier New",monospace; }
  .triptych { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; } figure { margin:0; } figure img { display:block; width:100%; border:1px solid var(--rule); background:#e9ece6; } figcaption { margin-top:8px; color:var(--muted); font:700 10px/1.3 "Courier New",monospace; text-transform:uppercase; }
  .screens { display:grid; grid-template-columns:1fr 1fr 280px; gap:14px; align-items:start; } .screens img { width:100%; border:1px solid var(--rule); }
  table { display:block; width:100%; overflow-x:auto; border-collapse:collapse; } th,td { padding:12px; border:1px solid var(--rule); text-align:left; overflow-wrap:anywhere; } th { color:var(--muted); font:700 10px/1.2 "Courier New",monospace; text-transform:uppercase; }
  code { font-family:"Courier New",monospace; overflow-wrap:anywhere; word-break:break-word; } .pass { color:var(--cyan); } .block-text { color:var(--red); }
  @media(max-width:800px){
    header,main{width:calc(100% - 24px);} section{padding:14px;} .metrics,.flow,.triptych,.screens{grid-template-columns:minmax(0,1fr);} .metric{border-right:0;border-bottom:1px solid var(--rule);}
    table,tbody,tr,td{display:block;width:100%;} thead{display:none;} tr{margin-bottom:10px;border:1px solid var(--rule);} td{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;border:0;border-bottom:1px solid var(--rule);overflow-wrap:normal;word-break:normal;} td:last-child{border-bottom:0;} td::before{content:attr(data-label);color:var(--muted);font:700 10px/1.2 "Courier New",monospace;text-transform:uppercase;}
  }
</style>
</head>
<body>
<header>
  <div class="kicker">Local empirical report · ${escapeHtml(receipt.generatedAt)}</div>
  <h1>One action. Two visual verdicts.</h1>
  <p>The same top-level WebMCP-shaped flow creates a visible optical defect, refuses an audit after its revision becomes stale, applies one allowlisted token repair, and requires a new zero-difference render before PASS.</p>
</header>
<main>
  <section>
    <h2>What this run proved</h2>
    <div class="metrics">
      <div class="metric"><span>R1 changed</span><strong><i>${r1Audit.comparison.changedPixels.toLocaleString('en-US')}</i>&nbsp;px</strong></div>
      <div class="metric"><span>Targets found</span><strong><i>${r1Audit.comparison.targetCandidates.length}</i>&nbsp;/ 2</strong></div>
      <div class="metric"><span>Outside targets</span><strong><i>${r1Audit.comparison.outsideTargetPixels}</i>&nbsp;px</strong></div>
      <div class="metric"><span>R2 changed</span><strong class="pass"><i>${r2Audit.comparison.changedPixels}</i>&nbsp;px</strong></div>
    </div>
  </section>
  <section>
    <h2>Revision-bound chronology</h2>
    <div class="flow">
      <div class="step"><h3>R0</h3><small>approved baseline</small></div>
      <div class="step"><h3>R1</h3><small>compact action succeeds</small></div>
      <div class="step block"><h3 class="block-text">BLOCK</h3><small>${r1Audit.comparison.changedPixels} changed pixels</small></div>
      <div class="step block"><h3>STALE</h3><small>R1 evidence cannot certify R2</small></div>
      <div class="step"><h3 class="pass">R2 PASS</h3><small>fresh audit · zero difference</small></div>
    </div>
  </section>
  <section>
    <h2>R1: the defect is visible and localized</h2>
    <div class="triptych">
      <figure><img src="${dataUri(images['r1-reference.png'])}" alt="Approved compact-layout reference"><figcaption>Approved reference · baseline aligned</figcaption></figure>
      <figure><img src="${dataUri(images['r1-current.png'])}" alt="R1 current raster with the numerals visibly lower"><figcaption>R1 current · numerals shifted 2 CSS px</figcaption></figure>
      <figure><img src="${dataUri(images['r1-diff.png'])}" alt="Exact red pixel difference mask"><figcaption>Exact difference · red pixels only inside two registered targets</figcaption></figure>
    </div>
  </section>
  <section>
    <h2>Freshness is part of the verdict</h2>
    <table>
      <thead><tr><th>Audit</th><th>Evidence revision</th><th>Current at completion</th><th>Freshness</th><th>Verdict</th></tr></thead>
      <tbody>
        <tr><td data-label="Audit">Initial optical audit</td><td data-label="Evidence revision">R1</td><td data-label="Current at completion">R1</td><td data-label="Freshness">fresh</td><td data-label="Verdict" class="block-text">BLOCK</td></tr>
        <tr><td data-label="Audit">Real race</td><td data-label="Evidence revision">${escapeHtml(staleAudit.auditedRevisionId)}</td><td data-label="Current at completion">${escapeHtml(staleAudit.currentRevisionId)}</td><td data-label="Freshness">${escapeHtml(staleAudit.freshness)}</td><td data-label="Verdict" class="block-text">${escapeHtml(staleAudit.verdict)}</td></tr>
        <tr><td data-label="Audit">Post-repair audit</td><td data-label="Evidence revision">R2</td><td data-label="Current at completion">R2</td><td data-label="Freshness">fresh</td><td data-label="Verdict" class="pass">PASS</td></tr>
      </tbody>
    </table>
  </section>
  <section>
    <h2>R2: the independent rerender collapses to zero</h2>
    <div class="triptych">
      <figure><img src="${dataUri(images['r1-reference.png'])}" alt="Approved reference repeated"><figcaption>Approved reference</figcaption></figure>
      <figure><img src="${dataUri(images['r2-current.png'])}" alt="Repaired R2 current raster"><figcaption>R2 current · allowlisted alignment repair</figcaption></figure>
      <figure><img src="${dataUri(images['r2-diff.png'])}" alt="R2 zero-difference mask"><figcaption>Exact difference · ${r2Audit.comparison.changedPixels} changed pixels</figcaption></figure>
    </div>
  </section>
  <section>
    <h2>The same evidence remains inspectable in the product UI</h2>
    <div class="screens">
      <figure><img src="${dataUri(images['desktop-block.png'])}" alt="Desktop optical bench showing R1 BLOCK"><figcaption>1280 × 720 · R1 BLOCK</figcaption></figure>
      <figure><img src="${dataUri(images['desktop-pass.png'])}" alt="Desktop optical bench showing R2 PASS"><figcaption>1280 × 720 · R2 PASS</figcaption></figure>
      <figure><img src="${dataUri(images['mobile-pass.png'])}" alt="Mobile optical bench showing R2 PASS"><figcaption>390 × 844 · visible controls and evidence</figcaption></figure>
    </div>
  </section>
  <section>
    <h2>Machine receipt</h2>
    <p>Source commit: <code>${escapeHtml(receipt.sourceCommit || 'uncommitted verification node')}</code></p>
    <p>Source binding: <code>${Object.keys(receipt.sourceFiles).length} explicitly listed files with SHA-256 and byte length</code></p>
    <p>Runtime: <code>${escapeHtml(receipt.runtime.node)} · Playwright ${escapeHtml(receipt.runtime.playwright)} · ${escapeHtml(receipt.runtime.browser)}</code></p>
    <p>Exercised API shape: <code>${escapeHtml(receipt.webmcp.apiPath)} · ${escapeHtml(receipt.webmcp.boundary)} · ${escapeHtml(receipt.webmcp.executeToolResult)}</code></p>
    <p><a href="receipt.json">Open the exact JSON receipt</a></p>
  </section>
</main>
</body>
</html>`;
  await writeFile(join(OUTPUT, 'index.html'), html);
  console.log(JSON.stringify({
    ok: true,
    report: 'artifacts/local-proof/index.html',
    receipt: 'artifacts/local-proof/receipt.json',
    r1ChangedPixels: r1Audit.comparison.changedPixels,
    r1TargetCandidates: r1Audit.comparison.targetCandidates.length,
    outsideTargetPixels: r1Audit.comparison.outsideTargetPixels,
    staleVerdict: staleAudit.verdict,
    r2ChangedPixels: r2Audit.comparison.changedPixels,
    r2Verdict: r2Audit.verdict,
    sourceCommit: receipt.sourceCommit,
  }));
} finally {
  await browser.close();
  await server.close();
}
