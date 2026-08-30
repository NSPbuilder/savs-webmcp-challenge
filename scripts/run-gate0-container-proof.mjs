import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUTPUT_DIR = join(ROOT, 'artifacts', 'gate0-container-proof');
const RECEIPT_PATH = join(OUTPUT_DIR, 'receipt.json');
const CONTAINER_CLI = process.env.CONTAINER_CLI || 'docker';
const PORT = Number(process.env.GATE0_PORT || 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FIELD_LIMIT_BYTES = 65_536;
const RECEIPT_LIMIT_BYTES = 1_048_576;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const BUILD_COMMAND_TIMEOUT_MS = 300_000;
const VERIFIER_COMMAND_TIMEOUT_MS = 180_000;
const COMMAND_CLOSE_GRACE_MS = 2_000;
const COMMAND_TERM_GRACE_MS = 2_000;
const COMMAND_KILL_GRACE_MS = 2_000;
const READINESS_TIMEOUT_MS = Number(process.env.GATE0_READINESS_TIMEOUT_MS || 30_000);
const READINESS_REQUEST_TIMEOUT_MS = Number(
  process.env.GATE0_READINESS_REQUEST_TIMEOUT_MS || 2_000,
);
const RUNNER_TOTAL_TIMEOUT_MS = 480_000;
const RUNNER_FINALIZATION_RESERVE_MS = 60_000;
const SOURCE_SHA = process.env.GITHUB_SHA || null;
const IMAGE_TAG = process.env.GATE0_IMAGE_TAG
  || `savs-webmcp-gate0:${SOURCE_SHA?.slice(0, 12) || 'manual'}`;
const CONTAINER_NAME = (
  process.env.GATE0_CONTAINER_NAME
  || `savs-webmcp-gate0-${process.env.GITHUB_RUN_ID || process.pid}-${process.env.GITHUB_RUN_ATTEMPT || 1}`
).replaceAll(/[^a-zA-Z0-9_.-]/g, '-');

assert.ok(Number.isInteger(PORT) && PORT > 0 && PORT <= 65_535, 'GATE0_PORT must be a valid port');
assert.ok(
  Number.isInteger(READINESS_TIMEOUT_MS) && READINESS_TIMEOUT_MS > 0,
  'GATE0_READINESS_TIMEOUT_MS must be a positive integer',
);
assert.ok(
  Number.isInteger(READINESS_REQUEST_TIMEOUT_MS) && READINESS_REQUEST_TIMEOUT_MS > 0,
  'GATE0_READINESS_REQUEST_TIMEOUT_MS must be a positive integer',
);

function appendTail(current, chunk, limit) {
  const merged = Buffer.concat([current, chunk]);
  return merged.length <= limit ? merged : merged.subarray(merged.length - limit);
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

export class CommandError extends Error {
  constructor(command, args, code, stdout, stderr) {
    super(`${commandLabel(command, args)} exited with ${code}`);
    this.name = 'CommandError';
    this.command = command;
    this.args = args;
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export class CommandLifecycleError extends Error {
  constructor(lifecycleCode, command, args, message, details = {}) {
    super(`${commandLabel(command, args)}: ${message}`);
    this.name = 'CommandLifecycleError';
    this.lifecycleCode = lifecycleCode;
    this.command = command;
    this.args = args;
    Object.assign(this, details);
  }
}

export class RunnerLifecycleError extends Error {
  constructor(lifecycleCode, message) {
    super(message);
    this.name = 'RunnerLifecycleError';
    this.lifecycleCode = lifecycleCode;
  }
}

export function createRunnerDeadline({
  totalTimeoutMs = RUNNER_TOTAL_TIMEOUT_MS,
  finalizationReserveMs = RUNNER_FINALIZATION_RESERVE_MS,
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onOperationDeadline = () => {},
  onTotalDeadline = () => {},
} = {}) {
  assert.ok(Number.isInteger(totalTimeoutMs) && totalTimeoutMs > 0);
  assert.ok(Number.isInteger(finalizationReserveMs) && finalizationReserveMs > 0);
  assert.ok(finalizationReserveMs < totalTimeoutMs);

  const startedAt = now();
  const operationTimeoutMs = totalTimeoutMs - finalizationReserveMs;
  let operationDeadlineReached = false;
  let totalDeadlineReached = false;
  let closed = false;
  let rejectOperationDeadline;
  const operationDeadlinePromise = new Promise((resolveDeadline, rejectDeadline) => {
    rejectOperationDeadline = rejectDeadline;
  });
  operationDeadlinePromise.catch(() => {});
  const operationTimer = setTimer(() => {
    operationDeadlineReached = true;
    rejectOperationDeadline(new RunnerLifecycleError(
      'RUNNER_OPERATION_TIMEOUT',
      `Runner operation budget ${operationTimeoutMs} ms is exhausted`,
    ));
    onOperationDeadline();
  }, operationTimeoutMs);
  const totalTimer = setTimer(() => {
    totalDeadlineReached = true;
    onTotalDeadline();
  }, totalTimeoutMs);

  return {
    startedAt,
    totalTimeoutMs,
    operationTimeoutMs,
    finalizationReserveMs,
    get operationDeadlineReached() {
      return operationDeadlineReached;
    },
    get totalDeadlineReached() {
      return totalDeadlineReached;
    },
    remainingOperationMs() {
      if (closed || operationDeadlineReached) return 0;
      return Math.max(0, Math.floor(operationTimeoutMs - (now() - startedAt)));
    },
    timeoutFor(requestedMs) {
      assert.ok(Number.isInteger(requestedMs) && requestedMs > 0);
      const remainingMs = this.remainingOperationMs();
      if (remainingMs <= 0) {
        throw new RunnerLifecycleError(
          'RUNNER_OPERATION_TIMEOUT',
          `Runner operation budget ${operationTimeoutMs} ms is exhausted`,
        );
      }
      return Math.max(1, Math.min(requestedMs, remainingMs));
    },
    raceOperation(operation) {
      return Promise.race([Promise.resolve(operation), operationDeadlinePromise]);
    },
    close() {
      if (closed) return;
      closed = true;
      clearTimer(operationTimer);
      clearTimer(totalTimer);
    },
  };
}

function boundedString(value, limit = FIELD_LIMIT_BYTES) {
  let tail = appendTail(Buffer.alloc(0), Buffer.from(String(value ?? '')), limit);
  while (tail.length > 0 && (tail[0] & 0xc0) === 0x80) tail = tail.subarray(1);
  return tail.toString('utf8');
}

export function installEmergencyReceiptHooks(receipt, {
  receiptPath = RECEIPT_PATH,
  containerCli = CONTAINER_CLI,
  containerName = CONTAINER_NAME,
  processTarget = process,
  spawnSyncImpl = spawnSync,
  existsSyncImpl = existsSync,
  writeFileSyncImpl = writeFileSync,
  now = () => new Date().toISOString(),
} = {}) {
  let receiptWritten = existsSyncImpl(receiptPath);
  let writing = false;

  const remove = () => {
    processTarget.off('beforeExit', onBeforeExit);
    processTarget.off('exit', onExit);
  };

  const writeFallback = (reason, exitCode = null) => {
    if (receiptWritten || writing) return false;
    writing = true;
    try {
      if (existsSyncImpl(receiptPath)) {
        receiptWritten = true;
        return false;
      }

      let cleanup;
      try {
        const result = spawnSyncImpl(
          containerCli,
          ['rm', '--force', containerName],
          { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        cleanup = {
          attempted: true,
          verified: false,
          outcome: 'unverified',
          exitCode: result.status ?? null,
          signal: result.signal ?? null,
          stdoutTail: boundedString(result.stdout),
          stderrTail: boundedString(result.stderr),
          error: result.error ? boundedString(result.error.message) : null,
        };
      } catch (error) {
        cleanup = {
          attempted: true,
          verified: false,
          outcome: 'failed',
          error: boundedString(error?.message || error),
        };
      }

      const emergencyReceipt = {
        schemaVersion: receipt.schemaVersion,
        status: 'failed',
        startedAt: receipt.startedAt,
        endedAt: now(),
        emergency: true,
        artifactPolicy: receipt.artifactPolicy,
        workflow: receipt.workflow,
        source: {
          checkoutCommit: receipt.source?.checkoutCommit || null,
        },
        container: {
          name: receipt.container?.name || containerName,
          origin: receipt.container?.origin || null,
          started: receipt.container?.started === true,
          stopped: false,
          residualContainerIds: null,
        },
        execution: receipt.execution || null,
        failure: {
          name: 'EmergencyExit',
          message: boundedString(reason),
          exitCode,
        },
        cleanup,
      };
      const bytes = Buffer.from(`${JSON.stringify(emergencyReceipt, null, 2)}\n`);
      if (bytes.length > RECEIPT_LIMIT_BYTES) return false;
      writeFileSyncImpl(receiptPath, bytes, { flag: 'wx' });
      receiptWritten = true;
      return true;
    } catch {
      return false;
    } finally {
      writing = false;
    }
  };

  const onBeforeExit = (code) => {
    writeFallback('Process reached beforeExit before the normal Gate 0 receipt was written', code);
  };
  const onExit = (code) => {
    writeFallback('Process exited before the normal Gate 0 receipt was written', code);
  };

  processTarget.on('beforeExit', onBeforeExit);
  processTarget.on('exit', onExit);

  return {
    get receiptWritten() {
      return receiptWritten;
    },
    writeFallback,
    markReceiptWritten() {
      receiptWritten = true;
      remove();
    },
    remove,
  };
}

export async function runCommand(command, args, {
  cwd = ROOT,
  env = process.env,
  echo = false,
  captureLimit = FIELD_LIMIT_BYTES,
  allowFailure = false,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  closeGraceMs = COMMAND_CLOSE_GRACE_MS,
  termGraceMs = COMMAND_TERM_GRACE_MS,
  killGraceMs = COMMAND_KILL_GRACE_MS,
  spawnImpl = spawn,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  for (const [name, value] of Object.entries({
    captureLimit,
    timeoutMs,
    closeGraceMs,
    termGraceMs,
    killGraceMs,
  })) {
    assert.ok(Number.isInteger(value) && value > 0, `${name} must be a positive integer`);
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    let spawnError = null;
    let exitObserved = false;
    let closeObserved = false;
    let exitCode = null;
    let exitSignal = null;
    const signalsSent = [];
    const signalAttempts = [];
    const timers = new Set();

    const schedule = (callback, delayMs) => {
      const timer = setTimer(() => {
        timers.delete(timer);
        callback();
      }, delayMs);
      timers.add(timer);
      return timer;
    };

    const clearTimers = () => {
      for (const timer of timers) clearTimer(timer);
      timers.clear();
    };

    const resultValue = (code = exitCode, signal = exitSignal) => ({
      code,
      signal,
      stdout: stdout.toString('utf8'),
      stderr: stderr.toString('utf8'),
      stdoutTruncated: stdoutBytes > captureLimit,
      stderrTruncated: stderrBytes > captureLimit,
    });

    let onError;
    let onExit;
    let onClose;
    const removeLifecycleListeners = () => {
      child.off('error', onError);
      child.off('exit', onExit);
      child.off('close', onClose);
    };

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimers();
      removeLifecycleListeners();
      if (error) reject(error);
      else resolve(result);
    };

    const lifecycleError = (lifecycleCode, message, cause = null) => {
      const result = resultValue();
      return new CommandLifecycleError(lifecycleCode, command, args, message, {
        cause,
        exitObserved,
        exitCode,
        exitSignal,
        signalsSent: [...signalsSent],
        signalAttempts: [...signalAttempts],
        terminationVerified: closeObserved,
        stdout: result.stdout,
        stderr: result.stderr,
        stdoutTruncated: result.stdoutTruncated,
        stderrTruncated: result.stderrTruncated,
      });
    };

    let closeDeadlineScheduled = false;
    const scheduleCloseDeadline = (cause = null) => {
      if (settled || closeDeadlineScheduled) return;
      closeDeadlineScheduled = true;
      schedule(() => {
        detachUnclosedChild();
        finish(lifecycleError(
          'COMMAND_CLOSE_TIMEOUT',
          `close was not observed within ${closeGraceMs} ms`,
          cause,
        ));
      }, closeGraceMs);
    };

    const sendSignal = (signal) => {
      if (settled || exitObserved) return;
      try {
        const accepted = child.kill(signal);
        signalAttempts.push({ signal, accepted });
        if (accepted) signalsSent.push(signal);
      } catch (error) {
        signalAttempts.push({ signal, accepted: false, error: boundedString(error?.message || error) });
        if (!spawnError) spawnError = error;
      }
    };

    const detachUnclosedChild = () => {
      if (closeObserved) return;
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref?.();
    };

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      stdout = appendTail(stdout, chunk, captureLimit);
      if (echo) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      stderr = appendTail(stderr, chunk, captureLimit);
      if (echo) process.stderr.write(chunk);
    });

    onError = (error) => {
      if (!spawnError) spawnError = error;
      if (!timedOut) scheduleCloseDeadline(error);
    };
    onExit = (code, signal) => {
      exitObserved = true;
      exitCode = code;
      exitSignal = signal;
      scheduleCloseDeadline();
    };
    onClose = (code, signal) => {
      closeObserved = true;
      const result = {
        ...resultValue(code, signal),
      };
      if (timedOut) {
        finish(lifecycleError(
          'COMMAND_TIMEOUT',
          `did not complete within ${timeoutMs} ms`,
          spawnError,
        ));
      } else if (spawnError) {
        spawnError.stdout = result.stdout;
        spawnError.stderr = result.stderr;
        finish(spawnError);
      } else if (code === 0 || allowFailure) {
        finish(null, result);
      } else {
        finish(new CommandError(command, args, code, result.stdout, result.stderr));
      }
    };
    child.on('error', onError);
    child.once('exit', onExit);
    child.once('close', onClose);

    schedule(() => {
      if (settled) return;
      timedOut = true;
      sendSignal('SIGTERM');
      schedule(() => {
        sendSignal('SIGKILL');
        schedule(() => {
          detachUnclosedChild();
          finish(lifecycleError(
            'COMMAND_TIMEOUT',
            `did not complete within ${timeoutMs} ms`,
            spawnError,
          ));
        }, killGraceMs);
      }, termGraceMs);
    }, timeoutMs);
  });
}

async function sha256File(relativePath) {
  const bytes = await readFile(join(ROOT, relativePath));
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

export async function waitForProduct({
  timeoutMs = READINESS_TIMEOUT_MS,
  requestTimeoutMs = READINESS_REQUEST_TIMEOUT_MS,
  origin = ORIGIN,
  fetchImpl = fetch,
  now = () => performance.now(),
  sleepImpl = (delayMs) => new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs)),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0, 'timeoutMs must be a positive integer');
  assert.ok(
    Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0,
    'requestTimeoutMs must be a positive integer',
  );

  const startedAt = now();
  let lastError;
  while (now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (now() - startedAt);
    const controller = new AbortController();
    let requestTimer;
    try {
      const requestDeadlineMs = Math.max(1, Math.min(requestTimeoutMs, remainingMs));
      const requestTimeout = new Promise((resolveRequest, rejectRequest) => {
        requestTimer = setTimer(() => {
          controller.abort();
          const error = new Error(`Readiness request exceeded ${requestDeadlineMs} ms`);
          error.code = 'READINESS_REQUEST_TIMEOUT';
          rejectRequest(error);
        }, requestDeadlineMs);
      });
      const request = (async () => {
        const response = await fetchImpl(origin, { signal: controller.signal });
        const body = await response.text();
        return { response, body };
      })();
      const { response, body } = await Promise.race([request, requestTimeout]);
      if (response.ok && body.includes('SAVS Optical Verification Bench')) {
        return Math.round(now() - startedAt);
      }
      lastError = new Error(`Health response ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      controller.abort();
      if (requestTimer !== undefined) clearTimer(requestTimer);
    }
    const sleepMs = Math.min(250, Math.max(0, timeoutMs - (now() - startedAt)));
    if (sleepMs > 0) await sleepImpl(sleepMs);
  }
  throw new Error(`Product did not become ready: ${lastError?.message || 'timeout'}`);
}

function selectedDockerVersion(value) {
  return {
    client: value.Client ? {
      version: value.Client.Version,
      apiVersion: value.Client.ApiVersion,
      os: value.Client.Os,
      arch: value.Client.Arch,
    } : null,
    server: value.Server ? {
      version: value.Server.Version,
      apiVersion: value.Server.ApiVersion,
      os: value.Server.Os,
      arch: value.Server.Arch,
      containerdVersion: value.Server.Components
        ?.find((component) => component.Name === 'containerd')?.Version || null,
    } : null,
  };
}

function selectedImage(value) {
  return {
    id: value.Id,
    repoTags: value.RepoTags || [],
    repoDigests: value.RepoDigests || [],
    created: value.Created,
    sizeBytes: value.Size,
    os: value.Os,
    architecture: value.Architecture,
  };
}

async function peakMemory(containerName, run = runCommand) {
  for (const cgroupPath of [
    '/sys/fs/cgroup/memory.peak',
    '/sys/fs/cgroup/memory/memory.max_usage_in_bytes',
  ]) {
    const result = await run(
      CONTAINER_CLI,
      ['exec', containerName, 'cat', cgroupPath],
      { allowFailure: true, phase: `peak-memory:${cgroupPath}` },
    );
    if (result.code === 0 && /^\d+$/.test(result.stdout.trim())) {
      return { bytes: Number(result.stdout.trim()), source: cgroupPath };
    }
  }
  throw new Error('Container cgroup peak memory is unavailable');
}

async function residualContainerIds(containerName, run = runCommand, phase = 'residual-check') {
  const result = await run(
    CONTAINER_CLI,
    ['ps', '--all', '--filter', `name=^/${containerName}$`, '--format', '{{.ID}}'],
    { phase },
  );
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/) : [];
}

async function removeContainer(containerName, run = runCommand) {
  const removal = await run(
    CONTAINER_CLI,
    ['rm', '--force', containerName],
    { allowFailure: true, echo: true, phase: 'cleanup:remove' },
  );
  return {
    attempted: true,
    removalExitCode: removal.code,
    removalSucceeded: removal.code === 0,
    residualVerified: true,
    residualContainerIds: await residualContainerIds(
      containerName,
      run,
      'cleanup:residual-after',
    ),
  };
}

export function assertCleanupComplete(cleanup) {
  assert.deepEqual(
    cleanup.residualContainerIds,
    [],
    `Residual containers remain: ${cleanup.residualContainerIds.join(', ')}`,
  );
}

export function failureValue(error) {
  const value = {
    name: error?.name || 'Error',
    message: boundedString(error?.message || error),
  };
  if (error instanceof CommandError) {
    value.command = commandLabel(error.command, error.args);
    value.exitCode = error.code;
    value.stdoutTail = boundedString(error.stdout);
    value.stderrTail = boundedString(error.stderr);
  } else if (error instanceof CommandLifecycleError) {
    value.lifecycleCode = error.lifecycleCode;
    value.command = commandLabel(error.command, error.args);
    value.exitObserved = error.exitObserved;
    value.exitCode = error.exitCode;
    value.exitSignal = error.exitSignal;
    value.signalsSent = error.signalsSent;
    value.signalAttempts = error.signalAttempts;
    value.terminationVerified = error.terminationVerified;
    value.stdoutTail = boundedString(error.stdout);
    value.stderrTail = boundedString(error.stderr);
  } else if (error instanceof RunnerLifecycleError) {
    value.lifecycleCode = error.lifecycleCode;
  }
  return value;
}

export function writeFinalReceipt(receipt, {
  receiptPath = RECEIPT_PATH,
  writeFileSyncImpl = writeFileSync,
} = {}) {
  const finalizedReceipt = {
    ...receipt,
    execution: {
      ...receipt.execution,
      currentPhase: null,
      currentCommand: null,
      lastCompletedFinalizationPhase: 'receipt-write',
      lastCompletedFinalizationCommand: null,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(finalizedReceipt, null, 2)}\n`);
  if (bytes.length > RECEIPT_LIMIT_BYTES) {
    throw new Error(`Receipt ${bytes.length} exceeds ${RECEIPT_LIMIT_BYTES} bytes`);
  }
  writeFileSyncImpl(receiptPath, bytes, { flag: 'wx' });
  return { bytes: bytes.length, receipt: finalizedReceipt };
}

export async function main() {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const receipt = {
    schemaVersion: 1,
    status: 'running',
    startedAt: new Date().toISOString(),
    artifactPolicy: {
      uploadPath: 'artifacts/gate0-container-proof/receipt.json',
      fieldLimitBytes: FIELD_LIMIT_BYTES,
      receiptLimitBytes: RECEIPT_LIMIT_BYTES,
    },
    workflow: {
      repository: process.env.GITHUB_REPOSITORY || null,
      commit: SOURCE_SHA,
      ref: process.env.GITHUB_REF || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      runnerOs: process.env.RUNNER_OS || null,
      runnerArch: process.env.RUNNER_ARCH || null,
      runnerName: process.env.RUNNER_NAME || null,
      imageOs: process.env.ImageOS || null,
      imageVersion: process.env.ImageVersion || null,
    },
    source: {},
    image: null,
    container: {
      name: CONTAINER_NAME,
      origin: ORIGIN,
      started: false,
      stopped: false,
      residualContainerIds: null,
    },
    execution: {
      runnerTotalTimeoutMs: RUNNER_TOTAL_TIMEOUT_MS,
      runnerOperationTimeoutMs: RUNNER_TOTAL_TIMEOUT_MS - RUNNER_FINALIZATION_RESERVE_MS,
      runnerFinalizationReserveMs: RUNNER_FINALIZATION_RESERVE_MS,
      operationDeadlineReached: false,
      totalDeadlineReached: false,
      currentPhase: 'setup',
      currentCommand: null,
      lastCompletedOperationPhase: null,
      lastCompletedOperationCommand: null,
      lastCompletedFinalizationPhase: null,
      lastCompletedFinalizationCommand: null,
      failedPhase: null,
      failedCommand: null,
    },
    verification: null,
  };

  let emergencyHooks;
  const runnerDeadline = createRunnerDeadline({
    onOperationDeadline: () => {
      receipt.execution.operationDeadlineReached = true;
      receipt.execution.operationDeadlineReachedAt = new Date().toISOString();
    },
    onTotalDeadline: () => {
      receipt.execution.totalDeadlineReached = true;
      receipt.execution.totalDeadlineReachedAt = new Date().toISOString();
      emergencyHooks?.writeFallback(
        `Runner exceeded its ${RUNNER_TOTAL_TIMEOUT_MS} ms total deadline`,
        1,
      );
      process.exit(1);
    },
  });
  emergencyHooks = installEmergencyReceiptHooks(receipt);

  const trackPhase = async (
    phase,
    command,
    operation,
    category = 'operation',
    enforceRunnerDeadline = true,
  ) => {
    receipt.execution.currentPhase = phase;
    receipt.execution.currentCommand = command;
    try {
      const operationValue = operation();
      const value = enforceRunnerDeadline
        ? await runnerDeadline.raceOperation(operationValue)
        : await operationValue;
      if (category === 'finalization') {
        receipt.execution.lastCompletedFinalizationPhase = phase;
        receipt.execution.lastCompletedFinalizationCommand = command;
      } else {
        receipt.execution.lastCompletedOperationPhase = phase;
        receipt.execution.lastCompletedOperationCommand = command;
      }
      return value;
    } catch (error) {
      receipt.execution.failedPhase = phase;
      receipt.execution.failedCommand = command;
      throw error;
    } finally {
      if (receipt.execution.currentPhase === phase) {
        receipt.execution.currentPhase = null;
        receipt.execution.currentCommand = null;
      }
    }
  };

  const runTrackedCommand = (command, args, options = {}) => {
    const {
      phase = 'command',
      timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
      finalization = false,
      ...commandOptions
    } = options;
    const effectiveTimeoutMs = finalization
      ? Math.min(timeoutMs, 10_000)
      : runnerDeadline.timeoutFor(timeoutMs);
    return trackPhase(
      phase,
      commandLabel(command, args),
      () => runCommand(command, args, {
        ...commandOptions,
        timeoutMs: effectiveTimeoutMs,
      }),
      finalization ? 'finalization' : 'operation',
      false,
    );
  };
  const operationRunCommand = runTrackedCommand;
  const finalizationRunCommand = (command, args, options = {}) => runTrackedCommand(
    command,
    args,
    { phase: 'cleanup:command', timeoutMs: 10_000, ...options, finalization: true },
  );

  let processFailed = false;
  try {
    assert.equal(receipt.workflow.repository, 'NSPbuilder/savs-webmcp-challenge');
    assert.match(SOURCE_SHA || '', /^[0-9a-f]{40}$/);

    const sourcePaths = [
      '.github/workflows/gate0-container-proof.yml',
      'Dockerfile',
      'package-lock.json',
      'scripts/run-gate0-container-proof.mjs',
      'scripts/verify-deployment.mjs',
    ];
    receipt.source = await trackPhase('source-hashes', null, async () => Object.fromEntries(
      await Promise.all(sourcePaths.map(async (path) => [path, await sha256File(path)])),
    ));

    const checkout = await operationRunCommand(
      'git',
      ['rev-parse', 'HEAD'],
      { phase: 'source-checkout' },
    );
    receipt.source.checkoutCommit = checkout.stdout.trim();
    assert.equal(receipt.source.checkoutCommit, SOURCE_SHA);

    const dockerVersion = await operationRunCommand(
      CONTAINER_CLI,
      ['version', '--format', '{{json .}}'],
      { phase: 'docker-version' },
    );
    receipt.docker = selectedDockerVersion(JSON.parse(dockerVersion.stdout));

    const buildStartedAt = performance.now();
    const build = await operationRunCommand(
      CONTAINER_CLI,
      ['build', '--tag', IMAGE_TAG, '.'],
      { echo: true, phase: 'image-build', timeoutMs: BUILD_COMMAND_TIMEOUT_MS },
    );
    receipt.build = {
      durationMs: Math.round(performance.now() - buildStartedAt),
      stdoutTail: build.stdout,
      stderrTail: build.stderr,
      stdoutTruncated: build.stdoutTruncated,
      stderrTruncated: build.stderrTruncated,
    };

    const imageInspect = await operationRunCommand(
      CONTAINER_CLI,
      ['image', 'inspect', '--format', '{{json .}}', IMAGE_TAG],
      { phase: 'image-inspect' },
    );
    receipt.image = selectedImage(JSON.parse(imageInspect.stdout));

    const runResult = await operationRunCommand(
      CONTAINER_CLI,
      [
        'run', '--detach', '--rm', '--init', '--ipc=host',
        '--name', CONTAINER_NAME,
        '--publish', `127.0.0.1:${PORT}:4173`,
        '--env', 'HOST=0.0.0.0',
        '--env', 'PORT=4173',
        IMAGE_TAG,
      ],
      { phase: 'container-start' },
    );
    receipt.container.id = runResult.stdout.trim();
    receipt.container.started = true;
    receipt.container.coldStartMs = await trackPhase(
      'container-readiness',
      `GET ${ORIGIN}`,
      () => waitForProduct({
        timeoutMs: runnerDeadline.timeoutFor(READINESS_TIMEOUT_MS),
      }),
      'operation',
      false,
    );

    const verification = await operationRunCommand(
      process.execPath,
      ['scripts/verify-deployment.mjs'],
      {
        env: { ...process.env, TARGET_ORIGIN: ORIGIN },
        echo: true,
        phase: 'external-origin-verifier',
        timeoutMs: VERIFIER_COMMAND_TIMEOUT_MS,
      },
    );
    receipt.verification = JSON.parse(verification.stdout.trim());
    assert.equal(receipt.verification.ok, true);

    receipt.container.peakMemory = await peakMemory(CONTAINER_NAME, operationRunCommand);
    const stats = await operationRunCommand(
      CONTAINER_CLI,
      ['stats', '--no-stream', '--format', '{{json .}}', CONTAINER_NAME],
      { phase: 'container-stats' },
    );
    receipt.container.finalStats = JSON.parse(stats.stdout);

    const processes = await operationRunCommand(
      CONTAINER_CLI,
      ['top', CONTAINER_NAME, '-eo', 'pid,ppid,comm,args'],
      { phase: 'container-processes' },
    );
    receipt.container.processesAfterAudits = processes.stdout;
    receipt.container.processListTruncated = processes.stdoutTruncated;
    assert.doesNotMatch(processes.stdout, /\b(?:chrome|chromium)\b/i);

    const state = await operationRunCommand(
      CONTAINER_CLI,
      ['inspect', '--format', '{{json .State}}', CONTAINER_NAME],
      { phase: 'container-state' },
    );
    receipt.container.stateBeforeStop = JSON.parse(state.stdout);
    const logs = await operationRunCommand(
      CONTAINER_CLI,
      ['logs', CONTAINER_NAME],
      { phase: 'container-logs' },
    );
    receipt.container.logTail = logs.stdout;
    receipt.container.errorLogTail = logs.stderr;
    receipt.container.logTruncated = logs.stdoutTruncated || logs.stderrTruncated;

    const stop = await operationRunCommand(
      CONTAINER_CLI,
      ['stop', '--time', '10', CONTAINER_NAME],
      { phase: 'container-stop' },
    );
    receipt.container.stopOutput = stop.stdout.trim();
    receipt.container.stopped = true;
    receipt.container.residualContainerIds = await residualContainerIds(
      CONTAINER_NAME,
      operationRunCommand,
      'container-residual-check',
    );
    assert.deepEqual(receipt.container.residualContainerIds, []);

    receipt.status = 'passed';
  } catch (error) {
    processFailed = true;
    receipt.status = 'failed';
    receipt.failure = failureValue(error);
    console.error(error);
  } finally {
    receipt.execution.finalizationStartedAt = new Date().toISOString();
    try {
      receipt.cleanup = await removeContainer(CONTAINER_NAME, finalizationRunCommand);
      receipt.container.residualContainerIds = receipt.cleanup.residualContainerIds;
      assertCleanupComplete(receipt.cleanup);
    } catch (cleanupError) {
      processFailed = true;
      receipt.status = 'failed';
      receipt.cleanup = {
        ...receipt.cleanup,
        attempted: receipt.cleanup?.attempted ?? true,
        residualVerified: receipt.cleanup?.residualVerified ?? false,
        failure: failureValue(cleanupError),
      };
    }
    receipt.endedAt = new Date().toISOString();
    try {
      receipt.execution.currentPhase = 'receipt-write';
      receipt.execution.currentCommand = null;
      const finalWrite = writeFinalReceipt(receipt);
      receipt.execution = finalWrite.receipt.execution;
      emergencyHooks.markReceiptWritten();
      console.log(`Gate 0 receipt: ${RECEIPT_PATH} (${finalWrite.bytes} bytes)`);
    } catch (receiptError) {
      processFailed = true;
      receipt.execution.failedPhase = 'receipt-write';
      receipt.execution.failedCommand = null;
      console.error(receiptError);
    } finally {
      receipt.execution.currentPhase = null;
      receipt.execution.currentCommand = null;
      runnerDeadline.close();
    }
  }

  if (processFailed || receipt.status !== 'passed') process.exitCode = 1;
}

const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (IS_MAIN) await main();
