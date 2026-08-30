import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  CommandError,
  CommandLifecycleError,
  RunnerLifecycleError,
  assertCleanupComplete,
  createRunnerDeadline,
  failureValue,
  installEmergencyReceiptHooks,
  runCommand,
  waitForProduct,
  writeFinalReceipt,
} from '../scripts/run-gate0-container-proof.mjs';

function createFakeChild(run) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.signals = [];
  child.unrefCalled = false;
  child.unref = () => {
    child.unrefCalled = true;
  };
  child.kill = (signal) => {
    child.signals.push(signal);
    return true;
  };
  queueMicrotask(() => run(child));
  return child;
}

function fakeSpawn(run, observed = {}) {
  return (command, args, options) => {
    Object.assign(observed, { command, args, options });
    const child = createFakeChild(run);
    observed.child = child;
    return child;
  };
}

function createFakeScheduler() {
  let clock = 0;
  let nextId = 1;
  const timers = new Map();
  const setTimer = (callback, delayMs) => {
    const timer = { id: nextId, at: clock + delayMs, callback };
    nextId += 1;
    timers.set(timer.id, timer);
    return timer;
  };
  const clearTimer = (timer) => timers.delete(timer.id);
  const advance = (delayMs) => {
    const target = clock + delayMs;
    while (true) {
      const due = [...timers.values()]
        .filter((timer) => timer.at <= target)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0];
      if (!due) break;
      timers.delete(due.id);
      clock = due.at;
      due.callback();
    }
    clock = target;
  };
  return { setTimer, clearTimer, advance };
}

test('runCommand drains output through exit then close and resolves once', async () => {
  const observed = {};
  const result = await runCommand('fake', ['ok'], {
    timeoutMs: 100,
    spawnImpl: fakeSpawn((child) => {
      child.stdout.end('hello');
      child.stderr.end('note');
      child.exitCode = 0;
      child.emit('exit', 0, null);
      child.emit('close', 0, null);
    }, observed),
  });

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'hello');
  assert.equal(result.stderr, 'note');
  assert.deepEqual(observed.args, ['ok']);
  assert.deepEqual(observed.options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('runCommand preserves bounded output on nonzero close', async () => {
  await assert.rejects(
    runCommand('fake', ['bad'], {
      captureLimit: 8,
      timeoutMs: 100,
      spawnImpl: fakeSpawn((child) => {
        child.stdout.end('0123456789');
        child.stderr.end('abcdefghij');
        child.exitCode = 7;
        child.emit('exit', 7, null);
        child.emit('close', 7, null);
      }),
    }),
    (error) => {
      assert.ok(error instanceof CommandError);
      assert.equal(error.code, 7);
      assert.equal(error.stdout, '23456789');
      assert.equal(error.stderr, 'cdefghij');
      return true;
    },
  );
});

test('runCommand rejects one spawn error even when close follows', async () => {
  const expected = Object.assign(new Error('spawn failed'), { code: 'ENOENT' });
  await assert.rejects(
    runCommand('missing', [], {
      timeoutMs: 100,
      spawnImpl: fakeSpawn((child) => {
        child.emit('error', expected);
        child.emit('close', -2, null);
      }),
    }),
    (error) => error === expected,
  );
});

test('runCommand rejects exit without close after the drain grace', async () => {
  const scheduler = createFakeScheduler();
  const observed = {};
  const promise = runCommand('fake', ['exit-only'], {
      timeoutMs: 100,
      closeGraceMs: 5,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      spawnImpl: fakeSpawn((child) => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
      }, observed),
    });
  await Promise.resolve();
  const rejected = assert.rejects(
    promise,
    (error) => {
      assert.ok(error instanceof CommandLifecycleError);
      assert.equal(error.lifecycleCode, 'COMMAND_CLOSE_TIMEOUT');
      assert.equal(error.exitObserved, true);
      assert.equal(error.exitCode, 0);
      return true;
    },
  );
  scheduler.advance(5);
  await rejected;
  assert.equal(observed.child.unrefCalled, true);
  assert.equal(observed.child.stdout.destroyed, true);
  assert.equal(observed.child.stderr.destroyed, true);
});

test('runCommand timeout sends TERM then KILL and settles without terminal events', async () => {
  const scheduler = createFakeScheduler();
  const observed = {};
  const promise = runCommand('fake', ['stuck'], {
      timeoutMs: 5,
      termGraceMs: 5,
      killGraceMs: 5,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      spawnImpl: fakeSpawn(() => {}, observed),
    });
  const rejected = assert.rejects(
    promise,
    (error) => {
      assert.ok(error instanceof CommandLifecycleError);
      assert.equal(error.lifecycleCode, 'COMMAND_TIMEOUT');
      assert.deepEqual(error.signalsSent, ['SIGTERM', 'SIGKILL']);
      return true;
    },
  );
  scheduler.advance(15);
  await rejected;
  assert.deepEqual(observed.child.signals, ['SIGTERM', 'SIGKILL']);
});

test('runCommand detaches an unclosed child when signal delivery is rejected', async () => {
  const scheduler = createFakeScheduler();
  let child;
  const promise = runCommand('fake', ['undetachable'], {
      timeoutMs: 5,
      termGraceMs: 5,
      killGraceMs: 5,
      setTimer: scheduler.setTimer,
      clearTimer: scheduler.clearTimer,
      spawnImpl: () => {
        child = createFakeChild(() => {});
        child.kill = () => false;
        child.unrefCalled = false;
        child.unref = () => {
          child.unrefCalled = true;
        };
        return child;
      },
    });
  const rejected = assert.rejects(
    promise,
    (error) => {
      assert.equal(error.lifecycleCode, 'COMMAND_TIMEOUT');
      assert.deepEqual(error.signalsSent, []);
      assert.deepEqual(error.signalAttempts, [
        { signal: 'SIGTERM', accepted: false },
        { signal: 'SIGKILL', accepted: false },
      ]);
      assert.equal(error.terminationVerified, false);
      return true;
    },
  );
  scheduler.advance(15);
  await rejected;
  assert.equal(child.unrefCalled, true);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test('timeout escalation owns an intervening error and still detaches', async () => {
  const scheduler = createFakeScheduler();
  const observed = {};
  const promise = runCommand('fake', ['error-during-timeout'], {
    timeoutMs: 5,
    termGraceMs: 5,
    killGraceMs: 5,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    spawnImpl: fakeSpawn((child) => {
      scheduler.setTimer(() => child.emit('error', new Error('late child error')), 6);
    }, observed),
  });
  const rejected = assert.rejects(promise, (error) => {
    assert.equal(error.lifecycleCode, 'COMMAND_TIMEOUT');
    assert.deepEqual(error.signalsSent, ['SIGTERM', 'SIGKILL']);
    assert.equal(error.cause.message, 'late child error');
    return true;
  });
  await Promise.resolve();
  scheduler.advance(15);
  await rejected;
  assert.equal(observed.child.unrefCalled, true);
  assert.equal(observed.child.stdout.destroyed, true);
  assert.equal(observed.child.stderr.destroyed, true);
});

test('runCommand timeout wins a later successful close without double settlement', async () => {
  const scheduler = createFakeScheduler();
  let child;
  const promise = runCommand('fake', ['race'], {
    timeoutMs: 5,
    termGraceMs: 20,
    killGraceMs: 20,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    spawnImpl: fakeSpawn((value) => {
      child = value;
      scheduler.setTimer(() => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
        child.emit('close', 0, null);
      }, 8);
    }),
  });

  await Promise.resolve();
  const rejected = assert.rejects(promise, (error) => {
    assert.equal(error.lifecycleCode, 'COMMAND_TIMEOUT');
    return true;
  });
  scheduler.advance(8);
  await rejected;
  assert.deepEqual(child.signals, ['SIGTERM']);
});

test('waitForProduct returns after an accepted bounded readiness response', async () => {
  let request;
  const elapsed = await waitForProduct({
    timeoutMs: 100,
    requestTimeoutMs: 20,
    fetchImpl: async (origin, options) => {
      request = { origin, options };
      return {
        ok: true,
        status: 200,
        text: async () => '<h1>SAVS Optical Verification Bench</h1>',
      };
    },
  });

  assert.equal(request.origin, 'http://127.0.0.1:4173');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.ok(elapsed >= 0);
});

test('waitForProduct aborts a never-settling request within the overall deadline', async () => {
  const signals = [];
  const startedAt = performance.now();

  await assert.rejects(
    waitForProduct({
      timeoutMs: 20,
      requestTimeoutMs: 5,
      sleepImpl: async () => {},
      fetchImpl: async (origin, { signal }) => {
        signals.push(signal);
        return new Promise(() => {});
      },
    }),
    /Product did not become ready: Readiness request exceeded/,
  );

  assert.ok(performance.now() - startedAt < 500);
  assert.ok(signals.length >= 1);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('waitForProduct also bounds a never-settling response body', async () => {
  const signals = [];
  await assert.rejects(
    waitForProduct({
      timeoutMs: 20,
      requestTimeoutMs: 5,
      sleepImpl: async () => {},
      fetchImpl: async (origin, { signal }) => {
        signals.push(signal);
        return { ok: true, status: 200, text: async () => new Promise(() => {}) };
      },
    }),
    /Product did not become ready: Readiness request exceeded/,
  );
  assert.ok(signals.length >= 1);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('runner deadline reserves finalization time and preempts longer phase limits', async () => {
  let nowMs = 100;
  const timers = [];
  const events = [];
  const deadline = createRunnerDeadline({
    totalTimeoutMs: 80,
    finalizationReserveMs: 10,
    now: () => nowMs,
    setTimer: (callback, delayMs) => {
      const timer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.cleared = true;
    },
    onOperationDeadline: () => events.push('operation'),
    onTotalDeadline: () => events.push('total'),
  });

  assert.equal(deadline.operationTimeoutMs, 70);
  assert.equal(deadline.finalizationReserveMs, 10);
  assert.equal(deadline.timeoutFor(1_000), 70);
  nowMs = 160;
  assert.equal(deadline.timeoutFor(1_000), 10);

  const pendingOperation = deadline.raceOperation(new Promise(() => {}));
  timers.find((timer) => timer.delayMs === 70).callback();
  await assert.rejects(
    pendingOperation,
    (error) => error instanceof RunnerLifecycleError
      && error.lifecycleCode === 'RUNNER_OPERATION_TIMEOUT',
  );
  assert.equal(deadline.remainingOperationMs(), 0);
  assert.throws(
    () => deadline.timeoutFor(1),
    (error) => error instanceof RunnerLifecycleError
      && error.lifecycleCode === 'RUNNER_OPERATION_TIMEOUT',
  );
  timers.find((timer) => timer.delayMs === 80).callback();
  assert.deepEqual(events, ['operation', 'total']);

  deadline.close();
  assert.ok(timers.every((timer) => timer.cleared));
});

test('emergency hook writes only a bounded failed receipt with unverified cleanup', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gate0-emergency-'));
  const receiptPath = join(directory, 'receipt.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const processTarget = new EventEmitter();
  const receipt = {
    schemaVersion: 1,
    status: 'running',
    startedAt: '2026-08-30T00:00:00.000Z',
    artifactPolicy: { receiptLimitBytes: 1_048_576 },
    workflow: { commit: 'a'.repeat(40) },
    source: {},
    container: { name: 'gate0-test', origin: 'http://127.0.0.1:4173', started: true },
    execution: {
      currentPhase: 'image-inspect',
      currentCommand: 'docker image inspect',
      lastCompletedPhase: 'image-build',
    },
  };
  const hooks = installEmergencyReceiptHooks(receipt, {
    receiptPath,
    processTarget,
    spawnSyncImpl: () => ({
      status: 0,
      signal: null,
      stdout: '😀'.repeat(20_000),
      stderr: '',
    }),
    now: () => '2026-08-30T00:00:01.000Z',
  });

  processTarget.emit('beforeExit', 0);
  processTarget.emit('exit', 13);
  const bytes = await readFile(receiptPath);
  const value = JSON.parse(bytes);
  assert.ok(bytes.length < 1_048_576);
  assert.equal(value.status, 'failed');
  assert.equal(value.emergency, true);
  assert.equal(value.execution.currentPhase, 'image-inspect');
  assert.equal(value.execution.lastCompletedPhase, 'image-build');
  assert.equal(value.cleanup.attempted, true);
  assert.equal(value.cleanup.verified, false);
  assert.equal(value.cleanup.outcome, 'unverified');
  assert.ok(Buffer.byteLength(value.cleanup.stdoutTail) <= 65_536);
  assert.notEqual(value.status, 'passed');
  assert.equal(hooks.receiptWritten, true);
  hooks.remove();
});

test('final receipt is synchronously persisted with completed phase metadata', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gate0-final-receipt-'));
  const receiptPath = join(directory, 'receipt.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const value = {
    schemaVersion: 1,
    status: 'passed',
    startedAt: '2026-08-30T00:00:00.000Z',
    endedAt: '2026-08-30T00:00:01.000Z',
    execution: {
      currentPhase: 'receipt-write',
      currentCommand: null,
      lastCompletedFinalizationPhase: 'cleanup:residual-after',
    },
  };

  const result = writeFinalReceipt(value, { receiptPath });
  const persisted = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(result.bytes, Buffer.byteLength(`${JSON.stringify(persisted, null, 2)}\n`));
  assert.equal(persisted.status, 'passed');
  assert.equal(persisted.execution.currentPhase, null);
  assert.equal(persisted.execution.currentCommand, null);
  assert.equal(persisted.execution.lastCompletedFinalizationPhase, 'receipt-write');
  assert.equal(Object.hasOwn(persisted, 'receiptBytes'), false);
  assert.throws(() => writeFinalReceipt(value, { receiptPath }), /EEXIST/);

  const originalBytes = await readFile(receiptPath);
  assert.throws(
    () => writeFinalReceipt({ ...value, oversized: '😀'.repeat(300_000) }, { receiptPath }),
    /exceeds 1048576 bytes/,
  );
  assert.deepEqual(await readFile(receiptPath), originalBytes);
});

test('failure receipt fields are bounded by UTF-8 bytes', () => {
  const unicode = '😀'.repeat(20_000);
  const error = new CommandLifecycleError(
    'COMMAND_TIMEOUT',
    'fake',
    ['unicode'],
    unicode,
    { stdout: unicode, stderr: unicode },
  );
  const failure = failureValue(error);
  assert.ok(Buffer.byteLength(failure.message) <= 65_536);
  assert.ok(Buffer.byteLength(failure.stdoutTail) <= 65_536);
  assert.ok(Buffer.byteLength(failure.stderrTail) <= 65_536);
});

test('cleanup completion rejects verified residual containers', () => {
  assert.doesNotThrow(() => assertCleanupComplete({ residualContainerIds: [] }));
  assert.throws(
    () => assertCleanupComplete({ residualContainerIds: ['still-running'] }),
    /Residual containers remain: still-running/,
  );
});

test('unfinished top-level await exits 13 and still leaves an emergency receipt', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gate0-unfinished-await-'));
  const receiptPath = join(directory, 'receipt.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const moduleUrl = new URL('../scripts/run-gate0-container-proof.mjs', import.meta.url).href;
  const script = `
    import { installEmergencyReceiptHooks } from ${JSON.stringify(moduleUrl)};
    const receipt = {
      schemaVersion: 1,
      status: 'running',
      startedAt: '2026-08-30T00:00:00.000Z',
      artifactPolicy: { receiptLimitBytes: 1048576 },
      workflow: { commit: '${'b'.repeat(40)}' },
      source: {},
      container: { name: 'gate0-test', origin: null, started: false },
      execution: {
        currentPhase: 'unfinished-await-regression',
        currentCommand: null,
        lastCompletedPhase: 'setup'
      }
    };
    installEmergencyReceiptHooks(receipt, {
      receiptPath: process.env.GATE0_TEST_RECEIPT,
      spawnSyncImpl: () => ({ status: null, signal: null, stdout: '', stderr: '' })
    });
    await new Promise(() => {});
  `;
  const result = await runCommand(
    process.execPath,
    ['--input-type=module', '--eval', script],
    {
      allowFailure: true,
      timeoutMs: 2_000,
      env: { ...process.env, GATE0_TEST_RECEIPT: receiptPath },
    },
  );

  assert.equal(result.code, 13);
  const bytes = await readFile(receiptPath);
  const value = JSON.parse(bytes);
  assert.ok(bytes.length < 1_048_576);
  assert.equal(value.status, 'failed');
  assert.equal(value.emergency, true);
  assert.equal(value.execution.currentPhase, 'unfinished-await-regression');
  assert.equal(value.execution.lastCompletedPhase, 'setup');
  assert.equal(value.cleanup.verified, false);
  assert.notEqual(value.status, 'passed');
});

test('runCommand handles real success, output bounds, and missing executables', async () => {
  const outputBytes = 70_000;
  const result = await runCommand(
    process.execPath,
    ['--eval', `process.stdout.write('x'.repeat(${outputBytes})); process.stderr.write('done')`],
    { timeoutMs: 2_000 },
  );
  assert.equal(result.code, 0);
  assert.equal(Buffer.byteLength(result.stdout), 65_536);
  assert.equal(result.stdoutTruncated, true);
  assert.equal(result.stderr, 'done');

  await assert.rejects(
    runCommand('gate0-command-that-does-not-exist', [], { timeoutMs: 2_000 }),
    (error) => error.code === 'ENOENT',
  );
});

test('runCommand forces a real TERM-resistant subprocess to stop', async () => {
  await assert.rejects(
    runCommand(
      process.execPath,
      [
        '--eval',
        "process.on('SIGTERM', () => {}); process.stdout.write('READY'); setInterval(() => {}, 1000)",
      ],
      { timeoutMs: 500, termGraceMs: 20, killGraceMs: 20 },
    ),
    (error) => {
      assert.equal(error.lifecycleCode, 'COMMAND_TIMEOUT');
      assert.deepEqual(error.signalsSent, ['SIGTERM', 'SIGKILL']);
      assert.equal(error.stdout, 'READY');
      return true;
    },
  );
});

test('readiness failure in the production runner records phase and cleanup', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gate0-fake-container-cli-'));
  const cliPath = join(directory, 'container-cli');
  const gitPath = join(directory, 'git');
  const statePath = join(directory, 'container-state');
  const sourceSha = 'c'.repeat(40);
  const artifactDirectory = join(process.cwd(), 'artifacts', 'gate0-container-proof');
  const receiptPath = join(artifactDirectory, 'receipt.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  t.after(() => rm(artifactDirectory, { recursive: true, force: true }));
  const stalledServer = createServer(() => {});
  await new Promise((resolveListen, rejectListen) => {
    stalledServer.once('error', rejectListen);
    stalledServer.listen(0, '127.0.0.1', resolveListen);
  });
  t.after(() => {
    stalledServer.closeAllConnections?.();
    stalledServer.close();
  });
  const gate0Port = stalledServer.address().port;

  const cliSource = `#!/usr/bin/env node
    import { existsSync, rmSync, writeFileSync } from 'node:fs';
    const args = process.argv.slice(2);
    const statePath = process.env.GATE0_FAKE_STATE;
    if (args[0] === 'version') {
      console.log(JSON.stringify({
        Client: { Version: 'test', ApiVersion: '1.0', Os: 'linux', Arch: 'amd64' },
        Server: { Version: 'test', ApiVersion: '1.0', Os: 'linux', Arch: 'amd64', Components: [] }
      }));
    } else if (args[0] === 'build') {
      process.exitCode = 0;
    } else if (args[0] === 'image' && args[1] === 'inspect') {
      console.log(JSON.stringify({
        Id: 'sha256:test', RepoTags: ['gate0:test'], RepoDigests: [],
        Created: '2026-08-30T00:00:00Z', Size: 1, Os: 'linux', Architecture: 'amd64'
      }));
    } else if (args[0] === 'run') {
      writeFileSync(statePath, 'running');
      console.log('fake-container-id');
    } else if (args[0] === 'ps') {
      if (existsSync(statePath)) console.log('fake-container-id');
    } else if (args[0] === 'rm') {
      if (process.env.GATE0_FAKE_PERSIST_RESIDUAL !== '1') rmSync(statePath, { force: true });
      console.log('fake-container-id');
    } else {
      console.error('unsupported fake container command', args);
      process.exitCode = 2;
    }
  `;
  const gitSource = `#!/usr/bin/env node
    if (process.argv.slice(2).join(' ') !== 'rev-parse HEAD') process.exitCode = 2;
    else console.log('${sourceSha}');
  `;
  await Promise.all([
    writeFile(cliPath, cliSource),
    writeFile(gitPath, gitSource),
  ]);
  await Promise.all([chmod(cliPath, 0o755), chmod(gitPath, 0o755)]);

  const baseEnvironment = {
    ...process.env,
    PATH: `${directory}${delimiter}${process.env.PATH}`,
    CONTAINER_CLI: cliPath,
    GATE0_FAKE_STATE: statePath,
    GATE0_PORT: String(gate0Port),
    GATE0_READINESS_TIMEOUT_MS: '20',
    GATE0_READINESS_REQUEST_TIMEOUT_MS: '5',
    GITHUB_REPOSITORY: 'NSPbuilder/savs-webmcp-challenge',
    GITHUB_SHA: sourceSha,
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ID: 'test-run',
    GITHUB_RUN_ATTEMPT: '1',
  };
  const runProductionRunner = (extraEnvironment = {}) => runCommand(
    process.execPath,
    ['scripts/run-gate0-container-proof.mjs'],
    {
      allowFailure: true,
      timeoutMs: 3_000,
      env: { ...baseEnvironment, ...extraEnvironment },
    },
  );

  const result = await runProductionRunner();

  assert.equal(result.code, 1);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.execution.failedPhase, 'container-readiness');
  assert.equal(receipt.execution.lastCompletedOperationPhase, 'container-start');
  assert.equal(receipt.execution.lastCompletedFinalizationPhase, 'receipt-write');
  assert.equal(receipt.cleanup.attempted, true);
  assert.deepEqual(receipt.cleanup.residualContainerIds, []);
  assert.deepEqual(receipt.container.residualContainerIds, []);
  assert.notEqual(receipt.status, 'passed');

  const residualResult = await runProductionRunner({ GATE0_FAKE_PERSIST_RESIDUAL: '1' });
  assert.equal(residualResult.code, 1);
  const residualReceipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(residualReceipt.status, 'failed');
  assert.deepEqual(residualReceipt.cleanup.residualContainerIds, ['fake-container-id']);
  assert.match(residualReceipt.cleanup.failure.message, /Residual containers remain/);
});
