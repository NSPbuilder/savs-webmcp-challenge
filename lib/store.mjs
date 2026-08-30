import { stableClone, stableJson } from './stable-json.mjs';

const BASE_TOKENS = Object.freeze({
  layoutDensity: 'comfortable',
  metricBaselineOffset: 0,
});

export class StoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.details = stableClone(details);
  }
}

function requireText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new StoreError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  }
  return value;
}

function revision(sequence, parentRevisionId, cause, tokens) {
  return Object.freeze({
    revisionId: `R${sequence}`,
    sequence,
    parentRevisionId,
    cause,
    tokens: Object.freeze({ ...tokens }),
  });
}

function publicSession(session) {
  return stableClone({
    sessionId: session.sessionId,
    currentRevisionId: session.currentRevisionId,
    revisions: [...session.revisions.values()],
  });
}

export class RevisionStore {
  #sessions = new Map();

  reset(sessionId = 'demo') {
    requireText(sessionId, 'sessionId');
    const initial = revision(0, null, 'reset', BASE_TOKENS);
    const session = {
      sessionId,
      currentRevisionId: initial.revisionId,
      revisions: new Map([[initial.revisionId, initial]]),
      receipts: new Map(),
    };
    this.#sessions.set(sessionId, session);
    return publicSession(session);
  }

  getState(sessionId = 'demo') {
    return publicSession(this.#requireSession(sessionId));
  }

  getRevision(sessionId = 'demo', revisionId) {
    const session = this.#requireSession(sessionId);
    requireText(revisionId, 'revisionId');
    const found = session.revisions.get(revisionId);
    if (!found) {
      throw new StoreError('REVISION_NOT_FOUND', `Unknown revision ${revisionId}`, {
        sessionId,
        revisionId,
      });
    }
    return stableClone(found);
  }

  applyCompactLayout({ sessionId = 'demo', idempotencyKey }) {
    return this.#apply({
      sessionId,
      idempotencyKey,
      operation: 'apply_compact_layout',
      argumentsValue: {},
      mutate: (current) => {
        if (
          current.cause !== 'reset' ||
          current.tokens.layoutDensity !== 'comfortable' ||
          current.tokens.metricBaselineOffset !== 0
        ) {
          throw new StoreError(
            'INVALID_TRANSITION',
            'Compact layout can only be applied to the approved R0 state',
            { currentRevisionId: current.revisionId },
          );
        }
        return {
          ...current.tokens,
          layoutDensity: 'compact',
          metricBaselineOffset: 2,
        };
      },
    });
  }

  applyAlignmentRepair({
    sessionId = 'demo',
    idempotencyKey,
    expectedRevisionId,
    token = 'metric-baseline-offset',
  }) {
    requireText(expectedRevisionId, 'expectedRevisionId');
    if (token !== 'metric-baseline-offset') {
      throw new StoreError('REPAIR_NOT_ALLOWLISTED', `Repair token ${token} is not allowlisted`, {
        allowed: ['metric-baseline-offset'],
        token,
      });
    }
    return this.#apply({
      sessionId,
      idempotencyKey,
      operation: 'apply_alignment_repair',
      argumentsValue: { expectedRevisionId, token },
      expectedRevisionId,
      mutate: (current) => {
        if (
          current.cause !== 'apply_compact_layout' ||
          current.tokens.layoutDensity !== 'compact' ||
          current.tokens.metricBaselineOffset !== 2
        ) {
          throw new StoreError(
            'INVALID_TRANSITION',
            'Alignment repair requires the compact-layout defect revision',
            { currentRevisionId: current.revisionId },
          );
        }
        return { ...current.tokens, metricBaselineOffset: 0 };
      },
    });
  }

  #requireSession(sessionId) {
    requireText(sessionId, 'sessionId');
    if (!this.#sessions.has(sessionId)) this.reset(sessionId);
    return this.#sessions.get(sessionId);
  }

  #apply({
    sessionId,
    idempotencyKey,
    operation,
    argumentsValue,
    expectedRevisionId,
    mutate,
  }) {
    requireText(idempotencyKey, 'idempotencyKey');
    const session = this.#requireSession(sessionId);
    const fingerprint = stableJson({ operation, arguments: argumentsValue });
    const existing = session.receipts.get(idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new StoreError(
          'IDEMPOTENCY_CONFLICT',
          `Idempotency key ${idempotencyKey} was already used with different arguments`,
          { idempotencyKey, operation },
        );
      }
      return stableClone(existing.result);
    }

    if (expectedRevisionId && session.currentRevisionId !== expectedRevisionId) {
      throw new StoreError(
        'REVISION_CONFLICT',
        `Expected ${expectedRevisionId}, current revision is ${session.currentRevisionId}`,
        { currentRevisionId: session.currentRevisionId, expectedRevisionId },
      );
    }

    const current = session.revisions.get(session.currentRevisionId);
    const nextTokens = mutate(current);
    if (stableJson(nextTokens) === stableJson(current.tokens)) {
      throw new StoreError('INVALID_TRANSITION', 'An action cannot create a no-change revision', {
        currentRevisionId: current.revisionId,
        operation,
      });
    }
    const next = revision(current.sequence + 1, current.revisionId, operation, nextTokens);
    session.revisions.set(next.revisionId, next);
    session.currentRevisionId = next.revisionId;
    const result = stableClone({
      sessionId,
      operation,
      fromRevisionId: current.revisionId,
      revision: next,
    });
    session.receipts.set(idempotencyKey, { fingerprint, result });
    return stableClone(result);
  }
}
