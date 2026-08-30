import assert from 'node:assert/strict';
import test from 'node:test';

import { RevisionStore, StoreError } from '../lib/store.mjs';
import { stableJson } from '../lib/stable-json.mjs';

test('stable JSON orders keys and rejects unsupported values', () => {
  assert.equal(stableJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.throws(() => stableJson({ value: Number.NaN }), TypeError);
});

test('reset creates only the approved immutable R0', () => {
  const store = new RevisionStore();
  const state = store.reset('case');
  assert.equal(state.currentRevisionId, 'R0');
  assert.deepEqual(state.revisions, [
    {
      cause: 'reset',
      parentRevisionId: null,
      revisionId: 'R0',
      sequence: 0,
      tokens: { layoutDensity: 'comfortable', metricBaselineOffset: 0 },
    },
  ]);
});

test('compact action is byte-equivalent on replay and conflict does not mutate', () => {
  const store = new RevisionStore();
  store.reset('case');
  const first = store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  const replay = store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  assert.equal(stableJson(replay), stableJson(first));
  assert.equal(first.revision.revisionId, 'R1');
  assert.equal(first.revision.tokens.metricBaselineOffset, 2);

  const before = stableJson(store.getState('case'));
  assert.throws(
    () =>
      store.applyAlignmentRepair({
        sessionId: 'case',
        idempotencyKey: 'compact-1',
        expectedRevisionId: 'R1',
      }),
    (error) => error instanceof StoreError && error.code === 'IDEMPOTENCY_CONFLICT',
  );
  assert.equal(stableJson(store.getState('case')), before);
});

test('repair changes only the allowlisted token and keeps R1 immutable', () => {
  const store = new RevisionStore();
  store.reset('case');
  store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  const r1Before = store.getRevision('case', 'R1');
  const repaired = store.applyAlignmentRepair({
    sessionId: 'case',
    idempotencyKey: 'repair-1',
    expectedRevisionId: 'R1',
  });
  assert.equal(repaired.revision.revisionId, 'R2');
  assert.deepEqual(repaired.revision.tokens, {
    layoutDensity: 'compact',
    metricBaselineOffset: 0,
  });
  assert.deepEqual(store.getRevision('case', 'R1'), r1Before);
  assert.equal(store.getState('case').revisions.length, 3);
});

test('repair refuses non-allowlisted and stale revisions without mutation', () => {
  const store = new RevisionStore();
  store.reset('case');
  store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  const before = stableJson(store.getState('case'));
  assert.throws(
    () =>
      store.applyAlignmentRepair({
        sessionId: 'case',
        idempotencyKey: 'repair-bad',
        expectedRevisionId: 'R1',
        token: 'anything-else',
      }),
    (error) => error instanceof StoreError && error.code === 'REPAIR_NOT_ALLOWLISTED',
  );
  assert.throws(
    () =>
      store.applyAlignmentRepair({
        sessionId: 'case',
        idempotencyKey: 'repair-stale',
        expectedRevisionId: 'R0',
      }),
    (error) => error instanceof StoreError && error.code === 'REVISION_CONFLICT',
  );
  assert.equal(stableJson(store.getState('case')), before);
});

test('reset clears prior revisions and receipts for the session', () => {
  const store = new RevisionStore();
  store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  store.reset('case');
  const result = store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  assert.equal(result.fromRevisionId, 'R0');
  assert.equal(store.getState('case').revisions.length, 2);
});

test('transition order cannot bypass or repeat the defect and repair sequence', () => {
  const store = new RevisionStore();
  store.reset('case');
  const r0 = stableJson(store.getState('case'));
  assert.throws(
    () =>
      store.applyAlignmentRepair({
        sessionId: 'case',
        idempotencyKey: 'repair-first',
        expectedRevisionId: 'R0',
      }),
    (error) => error instanceof StoreError && error.code === 'INVALID_TRANSITION',
  );
  assert.equal(stableJson(store.getState('case')), r0);

  store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-1' });
  const r1 = stableJson(store.getState('case'));
  assert.throws(
    () => store.applyCompactLayout({ sessionId: 'case', idempotencyKey: 'compact-2' }),
    (error) => error instanceof StoreError && error.code === 'INVALID_TRANSITION',
  );
  assert.equal(stableJson(store.getState('case')), r1);

  store.applyAlignmentRepair({
    sessionId: 'case',
    idempotencyKey: 'repair-1',
    expectedRevisionId: 'R1',
  });
  const r2 = stableJson(store.getState('case'));
  assert.throws(
    () =>
      store.applyAlignmentRepair({
        sessionId: 'case',
        idempotencyKey: 'repair-2',
        expectedRevisionId: 'R2',
      }),
    (error) => error instanceof StoreError && error.code === 'INVALID_TRANSITION',
  );
  assert.equal(stableJson(store.getState('case')), r2);
  assert.equal(store.getState('case').revisions.length, 3);
});
