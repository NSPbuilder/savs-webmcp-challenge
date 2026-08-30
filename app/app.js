const SESSION_ID = 'challenge';
const state = { application: null, audit: null, blinking: false };

const elements = {
  panel: document.querySelector('.verdict-panel'),
  currentRevision: document.querySelector('[data-current-revision]'),
  webmcpStatus: document.querySelector('[data-webmcp-status]'),
  liveSpecimen: document.querySelector('[data-live-specimen]'),
  emptyStage: document.querySelector('[data-empty-stage]'),
  comparisonStack: document.querySelector('[data-comparison-stack]'),
  referenceImage: document.querySelector('[data-reference-image]'),
  currentImage: document.querySelector('[data-current-image]'),
  diffStrip: document.querySelector('[data-diff-strip]'),
  diffImage: document.querySelector('[data-diff-image]'),
  diffCaption: document.querySelector('[data-diff-caption]'),
  verdictLabel: document.querySelector('[data-verdict-label]'),
  verdictReason: document.querySelector('[data-verdict-reason]'),
  changedPixels: document.querySelector('[data-changed-pixels]'),
  outsidePixels: document.querySelector('[data-outside-pixels]'),
  targetCount: document.querySelector('[data-target-count]'),
  controlPixels: document.querySelector('[data-control-pixels]'),
  evidenceRevision: document.querySelector('[data-evidence-revision]'),
  freshness: document.querySelector('[data-freshness]'),
  trace: document.querySelector('[data-revision-trace]'),
  note: document.querySelector('[data-action-note]'),
  blink: document.querySelector('[data-action="blink"]'),
};

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed with ${response.status}`);
    error.code = payload.error?.code || 'REQUEST_FAILED';
    throw error;
  }
  return payload;
}

function key(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}

function currentRevision() {
  return state.application?.revisions.find(
    (revision) => revision.revisionId === state.application.currentRevisionId,
  );
}

function effectiveAudit() {
  if (!state.audit) return null;
  const currentRevisionId = state.application?.currentRevisionId;
  if (!currentRevisionId || currentRevisionId === state.audit.auditedRevisionId) return state.audit;
  return {
    ...state.audit,
    currentRevisionId,
    freshness: 'stale',
    verdict: 'BLOCK',
    reason: 'Evidence belongs to an older revision. Run a fresh audit.',
  };
}

function specimenUrl(revisionId) {
  const query = new URLSearchParams({
    sessionId: SESSION_ID,
    revisionId,
    variant: 'current',
  });
  return `/specimen?${query}`;
}

function renderTrace() {
  const auditRevision = state.audit?.auditedRevisionId;
  elements.trace.replaceChildren(
    ...state.application.revisions.map((revision) => {
      const item = document.createElement('li');
      const isCurrent = revision.revisionId === state.application.currentRevisionId;
      const isBlocked = state.audit?.verdict === 'BLOCK' && auditRevision === revision.revisionId;
      item.dataset.state = isCurrent ? 'current' : isBlocked ? 'blocked' : 'past';
      const label = document.createElement('span');
      label.textContent = revision.revisionId;
      const title = document.createElement('strong');
      title.textContent = revision.cause === 'reset'
        ? 'Approved reference'
        : revision.cause === 'apply_compact_layout'
          ? 'Compact action'
          : 'Alignment repair';
      const detail = document.createElement('small');
      detail.textContent = `${revision.tokens.layoutDensity} · baseline ${revision.tokens.metricBaselineOffset} CSS px`;
      item.append(label, title, detail);
      return item;
    }),
  );
}

function renderAudit() {
  const audit = effectiveAudit();
  if (!audit) {
    elements.panel.dataset.verdict = 'WAITING';
    elements.verdictLabel.textContent = 'WAITING';
    elements.verdictReason.textContent = 'Apply the compact layout, then inspect its visual result.';
    for (const element of [
      elements.changedPixels,
      elements.outsidePixels,
      elements.targetCount,
      elements.controlPixels,
      elements.evidenceRevision,
      elements.freshness,
    ]) element.textContent = '—';
    elements.comparisonStack.hidden = true;
    elements.emptyStage.hidden = false;
    elements.diffStrip.hidden = true;
    elements.blink.disabled = true;
    elements.liveSpecimen.hidden = false;
    return;
  }
  elements.panel.dataset.verdict = audit.verdict;
  elements.verdictLabel.textContent = audit.verdict;
  elements.verdictReason.textContent = audit.reason;
  elements.changedPixels.textContent = audit.comparison.changedPixels.toLocaleString('en-US');
  elements.outsidePixels.textContent = audit.comparison.outsideTargetPixels.toLocaleString('en-US');
  elements.targetCount.textContent = audit.comparison.targetCandidates.length;
  elements.controlPixels.textContent = audit.stableControl.changedPixels.toLocaleString('en-US');
  elements.evidenceRevision.textContent = audit.auditedRevisionId;
  elements.freshness.textContent = audit.freshness;
  elements.referenceImage.src = audit.artifacts['reference.png'];
  elements.currentImage.src = audit.artifacts['current.png'];
  elements.diffImage.src = audit.artifacts['diff.png'];
  elements.diffCaption.textContent = `${audit.comparison.changedPixels.toLocaleString('en-US')} exact pixels`;
  elements.liveSpecimen.hidden = true;
  elements.emptyStage.hidden = true;
  elements.comparisonStack.hidden = false;
  elements.diffStrip.hidden = false;
  elements.blink.disabled = false;
}

function render() {
  const revisionId = state.application.currentRevisionId;
  elements.currentRevision.textContent = revisionId;
  elements.liveSpecimen.src = specimenUrl(revisionId);
  renderTrace();
  renderAudit();
}

async function refresh() {
  state.application = await api(`/api/state?sessionId=${encodeURIComponent(SESSION_ID)}`);
  render();
  return state.application;
}

async function reset() {
  state.application = await api('/api/reset', { method: 'POST', body: { sessionId: SESSION_ID } });
  state.audit = null;
  render();
  return state.application;
}

async function compact(args = {}) {
  const receipt = await api('/api/actions/compact', {
    method: 'POST',
    body: {
      sessionId: args.sessionId || SESSION_ID,
      idempotencyKey: args.idempotencyKey || key('compact'),
    },
  });
  await refresh();
  state.audit = null;
  render();
  return receipt;
}

async function audit(args = {}) {
  const revisionId = args.revisionId || state.application.currentRevisionId;
  const receipt = await api('/api/audits', {
    method: 'POST',
    body: {
      sessionId: args.sessionId || SESSION_ID,
      revisionId,
      auditId: args.auditId || key('audit'),
    },
  });
  await refresh();
  state.audit = receipt;
  render();
  return receipt;
}

async function repair(args = {}) {
  const expectedRevisionId = args.expectedRevisionId || state.application.currentRevisionId;
  const receipt = await api('/api/actions/repair', {
    method: 'POST',
    body: {
      sessionId: args.sessionId || SESSION_ID,
      idempotencyKey: args.idempotencyKey || key('repair'),
      expectedRevisionId,
      token: 'metric-baseline-offset',
    },
  });
  await refresh();
  render();
  return receipt;
}

async function runAction(label, operation) {
  elements.note.textContent = `${label}…`;
  try {
    const result = await operation();
    elements.note.textContent = `${label} complete.`;
    return result;
  } catch (error) {
    elements.note.textContent = `${error.code || 'ERROR'} · ${error.message}`;
    throw error;
  }
}

document.querySelector('[data-action="reset"]').addEventListener('click', () => runAction('Reset', reset));
document.querySelector('[data-action="compact"]').addEventListener('click', () => runAction('Compact action', compact));
document.querySelector('[data-action="audit"]').addEventListener('click', () => runAction('Visual audit', audit));
document.querySelector('[data-action="repair"]').addEventListener('click', () => runAction('Alignment repair', repair));
elements.blink.addEventListener('click', () => {
  state.blinking = !state.blinking;
  elements.comparisonStack.dataset.blinking = String(state.blinking);
  elements.blink.setAttribute('aria-pressed', String(state.blinking));
  elements.blink.textContent = state.blinking ? 'Stop blinking' : 'Blink compare';
});

function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

async function registerWebMcp() {
  const modelContext = document.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') {
    elements.webmcpStatus.textContent = 'WebMCP unavailable · visible controls active';
    return;
  }
  const tools = [
    {
      name: 'get_visual_state',
      description: 'Read the current immutable UI revision and the latest visible audit state.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const application = await refresh();
        return toolResult({ application, audit: effectiveAudit() });
      },
    },
    {
      name: 'apply_compact_layout',
      description: 'Apply the compact layout action and return the new immutable revision receipt.',
      inputSchema: {
        type: 'object',
        properties: { idempotencyKey: { type: 'string', minLength: 1 } },
        required: ['idempotencyKey'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (args) => toolResult(await compact(args)),
    },
    {
      name: 'run_visual_audit',
      description: 'Rerender approved reference and requested revision, compare exact pixels, and report freshness.',
      inputSchema: {
        type: 'object',
        properties: {
          revisionId: { type: 'string', pattern: '^R[0-9]+$' },
          auditId: { type: 'string', minLength: 1 },
        },
        required: ['revisionId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (args) => toolResult(await audit(args)),
    },
    {
      name: 'apply_alignment_repair',
      description: 'Create a successor revision by applying the single allowlisted baseline-alignment repair.',
      inputSchema: {
        type: 'object',
        properties: {
          idempotencyKey: { type: 'string', minLength: 1 },
          expectedRevisionId: { type: 'string', pattern: '^R[0-9]+$' },
        },
        required: ['idempotencyKey', 'expectedRevisionId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (args) => toolResult(await repair(args)),
    },
  ];
  try {
    for (const tool of tools) await modelContext.registerTool(tool);
    elements.webmcpStatus.textContent = `${tools.length} WebMCP tools available`;
  } catch (error) {
    console.error('WebMCP registration failed', error);
    elements.webmcpStatus.textContent = 'WebMCP registration failed · visible controls active';
  }
}

await registerWebMcp();
await reset();
