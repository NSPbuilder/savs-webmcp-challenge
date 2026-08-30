import assert from 'node:assert/strict';
import test from 'node:test';

import { stableJson } from '../lib/stable-json.mjs';
import { startServer } from '../server.mjs';
import { decodePng, sha256 } from '../verifier/png.mjs';

async function request(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('one server proves action, defect, stale refusal, repair, and fresh pass', { timeout: 60_000 }, async (t) => {
  const server = await startServer({ auditDelayMs: 80 });
  t.after(() => server.close());
  const sessionId = 'flow';

  const reset = await request(server.origin, '/api/reset', { sessionId });
  assert.equal(reset.body.currentRevisionId, 'R0');
  const compact = await request(server.origin, '/api/actions/compact', {
    sessionId,
    idempotencyKey: 'compact-1',
  });
  assert.equal(compact.body.revision.revisionId, 'R1');
  const replay = await request(server.origin, '/api/actions/compact', {
    sessionId,
    idempotencyKey: 'compact-1',
  });
  assert.equal(stableJson(replay.body), stableJson(compact.body));

  const beforeConflict = await request(server.origin, `/api/state?sessionId=${sessionId}`);
  const conflict = await request(server.origin, '/api/actions/repair', {
    sessionId,
    idempotencyKey: 'compact-1',
    expectedRevisionId: 'R1',
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const afterConflict = await request(server.origin, `/api/state?sessionId=${sessionId}`);
  assert.equal(stableJson(afterConflict.body), stableJson(beforeConflict.body));

  const r1Audit = await request(server.origin, '/api/audits', {
    sessionId,
    revisionId: 'R1',
    auditId: 'r1',
  });
  assert.equal(r1Audit.body.freshness, 'fresh');
  assert.equal(r1Audit.body.verdict, 'BLOCK');
  assert.ok(r1Audit.body.comparison.changedPixels > 0);
  assert.equal(r1Audit.body.comparison.outsideTargetPixels, 0);
  assert.deepEqual(r1Audit.body.comparison.targetCandidates, ['css-value', 'device-value']);
  assert.equal(r1Audit.body.stableControl.changedPixels, 0);

  const diffResponse = await fetch(`${server.origin}${r1Audit.body.artifacts['diff.png']}`);
  const diffBytes = Buffer.from(await diffResponse.arrayBuffer());
  const r1CurrentUrl = r1Audit.body.artifacts['current.png'];
  const r1CurrentBytes = Buffer.from(await (await fetch(`${server.origin}${r1CurrentUrl}`)).arrayBuffer());
  const decodedDiff = decodePng(diffBytes);
  assert.equal(decodedDiff.width, r1Audit.body.comparison.width);
  assert.equal(sha256(diffBytes), r1Audit.body.comparison.diffSha256);
  let redPixels = 0;
  for (let offset = 0; offset < decodedDiff.rgba.length; offset += 4) {
    if (
      decodedDiff.rgba[offset] === 211 &&
      decodedDiff.rgba[offset + 1] === 71 &&
      decodedDiff.rgba[offset + 2] === 53
    ) redPixels += 1;
  }
  assert.equal(redPixels, r1Audit.body.comparison.changedPixels);

  const staleAuditPromise = request(server.origin, '/api/audits', {
    sessionId,
    revisionId: 'R1',
    auditId: 'stale-r1',
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const repair = await request(server.origin, '/api/actions/repair', {
    sessionId,
    idempotencyKey: 'repair-1',
    expectedRevisionId: 'R1',
  });
  assert.equal(repair.body.revision.revisionId, 'R2');
  const staleAudit = await staleAuditPromise;
  assert.equal(staleAudit.body.auditedRevisionId, 'R1');
  assert.equal(staleAudit.body.currentRevisionId, 'R2');
  assert.equal(staleAudit.body.freshness, 'stale');
  assert.equal(staleAudit.body.verdict, 'BLOCK');

  const r2Audit = await request(server.origin, '/api/audits', {
    sessionId,
    revisionId: 'R2',
    auditId: 'r2',
  });
  assert.equal(r2Audit.body.freshness, 'fresh');
  assert.equal(r2Audit.body.verdict, 'PASS');
  assert.equal(r2Audit.body.comparison.changedPixels, 0);
  assert.equal(r2Audit.body.stableControl.changedPixels, 0);

  const reusedAuditId = await request(server.origin, '/api/audits', {
    sessionId,
    revisionId: 'R2',
    auditId: 'r1',
  });
  assert.equal(reusedAuditId.status, 409);
  assert.equal(reusedAuditId.body.error.code, 'AUDIT_ID_CONFLICT');
  const r1CurrentAfterR2 = Buffer.from(
    await (await fetch(`${server.origin}${r1CurrentUrl}`)).arrayBuffer(),
  );
  assert.equal(sha256(r1CurrentAfterR2), sha256(r1CurrentBytes));
  assert.deepEqual(r1CurrentAfterR2, r1CurrentBytes);
});
