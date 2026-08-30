import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUTPUT_DIR = join(ROOT, 'artifacts', 'gate0-container-proof');
const RECEIPT_PATH = join(OUTPUT_DIR, 'receipt.json');
const CONTAINER_CLI = process.env.CONTAINER_CLI || 'docker';
const PORT = Number(process.env.GATE0_PORT || 4173);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FIELD_LIMIT_BYTES = 65_536;
const RECEIPT_LIMIT_BYTES = 1_048_576;
const SOURCE_SHA = process.env.GITHUB_SHA || null;
const IMAGE_TAG = process.env.GATE0_IMAGE_TAG
  || `savs-webmcp-gate0:${SOURCE_SHA?.slice(0, 12) || 'manual'}`;
const CONTAINER_NAME = (
  process.env.GATE0_CONTAINER_NAME
  || `savs-webmcp-gate0-${process.env.GITHUB_RUN_ID || process.pid}-${process.env.GITHUB_RUN_ATTEMPT || 1}`
).replaceAll(/[^a-zA-Z0-9_.-]/g, '-');

assert.ok(Number.isInteger(PORT) && PORT > 0 && PORT <= 65_535, 'GATE0_PORT must be a valid port');

function appendTail(current, chunk, limit) {
  const merged = Buffer.concat([current, chunk]);
  return merged.length <= limit ? merged : merged.subarray(merged.length - limit);
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

class CommandError extends Error {
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

async function runCommand(command, args, {
  cwd = ROOT,
  env = process.env,
  echo = false,
  captureLimit = FIELD_LIMIT_BYTES,
  allowFailure = false,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutBytes = 0;
    let stderrBytes = 0;

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
    child.once('error', reject);
    child.once('close', (code, signal) => {
      const result = {
        code,
        signal,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        stdoutTruncated: stdoutBytes > captureLimit,
        stderrTruncated: stderrBytes > captureLimit,
      };
      if (code === 0 || allowFailure) resolve(result);
      else reject(new CommandError(command, args, code, result.stdout, result.stderr));
    });
  });
}

async function sha256File(relativePath) {
  const bytes = await readFile(join(ROOT, relativePath));
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}

async function waitForProduct(timeoutMs = 30_000) {
  const startedAt = performance.now();
  let lastError;
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(ORIGIN);
      const body = await response.text();
      if (response.ok && body.includes('SAVS Optical Verification Bench')) {
        return Math.round(performance.now() - startedAt);
      }
      lastError = new Error(`Health response ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
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

async function peakMemory(containerName) {
  for (const path of [
    '/sys/fs/cgroup/memory.peak',
    '/sys/fs/cgroup/memory/memory.max_usage_in_bytes',
  ]) {
    const result = await runCommand(
      CONTAINER_CLI,
      ['exec', containerName, 'cat', path],
      { allowFailure: true },
    );
    if (result.code === 0 && /^\d+$/.test(result.stdout.trim())) {
      return { bytes: Number(result.stdout.trim()), source: path };
    }
  }
  throw new Error('Container cgroup peak memory is unavailable');
}

async function residualContainerIds(containerName) {
  const result = await runCommand(CONTAINER_CLI, [
    'ps', '--all', '--filter', `name=^/${containerName}$`, '--format', '{{.ID}}',
  ]);
  return result.stdout.trim() ? result.stdout.trim().split(/\s+/) : [];
}

async function removeContainer(containerName) {
  const ids = await residualContainerIds(containerName);
  if (ids.length === 0) return { attempted: false, residualContainerIds: [] };
  const removal = await runCommand(
    CONTAINER_CLI,
    ['rm', '--force', containerName],
    { allowFailure: true, echo: true },
  );
  return {
    attempted: true,
    exitCode: removal.code,
    residualContainerIds: await residualContainerIds(containerName),
  };
}

function failureValue(error) {
  const value = {
    name: error?.name || 'Error',
    message: String(error?.message || error).slice(0, FIELD_LIMIT_BYTES),
  };
  if (error instanceof CommandError) {
    value.command = commandLabel(error.command, error.args);
    value.exitCode = error.code;
    value.stdoutTail = error.stdout.slice(-FIELD_LIMIT_BYTES);
    value.stderrTail = error.stderr.slice(-FIELD_LIMIT_BYTES);
  }
  return value;
}

async function writeBoundedReceipt(receipt) {
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  if (bytes.length > RECEIPT_LIMIT_BYTES) {
    await rm(RECEIPT_PATH, { force: true });
    throw new Error(`Receipt ${bytes.length} exceeds ${RECEIPT_LIMIT_BYTES} bytes`);
  }
  await writeFile(RECEIPT_PATH, bytes, { flag: 'wx' });
  return bytes.length;
}

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
  verification: null,
};

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
  receipt.source = Object.fromEntries(await Promise.all(
    sourcePaths.map(async (path) => [path, await sha256File(path)]),
  ));

  const checkout = await runCommand('git', ['rev-parse', 'HEAD']);
  receipt.source.checkoutCommit = checkout.stdout.trim();
  assert.equal(receipt.source.checkoutCommit, SOURCE_SHA);

  const dockerVersion = await runCommand(CONTAINER_CLI, ['version', '--format', '{{json .}}']);
  receipt.docker = selectedDockerVersion(JSON.parse(dockerVersion.stdout));

  const buildStartedAt = performance.now();
  const build = await runCommand(
    CONTAINER_CLI,
    ['build', '--tag', IMAGE_TAG, '.'],
    { echo: true },
  );
  receipt.build = {
    durationMs: Math.round(performance.now() - buildStartedAt),
    stdoutTail: build.stdout,
    stderrTail: build.stderr,
    stdoutTruncated: build.stdoutTruncated,
    stderrTruncated: build.stderrTruncated,
  };

  const imageInspect = await runCommand(
    CONTAINER_CLI,
    ['image', 'inspect', '--format', '{{json .}}', IMAGE_TAG],
  );
  receipt.image = selectedImage(JSON.parse(imageInspect.stdout));

  const runResult = await runCommand(CONTAINER_CLI, [
    'run', '--detach', '--rm', '--init', '--ipc=host',
    '--name', CONTAINER_NAME,
    '--publish', `127.0.0.1:${PORT}:4173`,
    '--env', 'HOST=0.0.0.0',
    '--env', 'PORT=4173',
    IMAGE_TAG,
  ]);
  receipt.container.id = runResult.stdout.trim();
  receipt.container.started = true;
  receipt.container.coldStartMs = await waitForProduct();

  const verification = await runCommand(
    process.execPath,
    ['scripts/verify-deployment.mjs'],
    { env: { ...process.env, TARGET_ORIGIN: ORIGIN }, echo: true },
  );
  receipt.verification = JSON.parse(verification.stdout.trim());
  assert.equal(receipt.verification.ok, true);

  receipt.container.peakMemory = await peakMemory(CONTAINER_NAME);
  const stats = await runCommand(
    CONTAINER_CLI,
    ['stats', '--no-stream', '--format', '{{json .}}', CONTAINER_NAME],
  );
  receipt.container.finalStats = JSON.parse(stats.stdout);

  const processes = await runCommand(
    CONTAINER_CLI,
    ['top', CONTAINER_NAME, '-eo', 'pid,ppid,comm,args'],
  );
  receipt.container.processesAfterAudits = processes.stdout;
  receipt.container.processListTruncated = processes.stdoutTruncated;
  assert.doesNotMatch(processes.stdout, /\b(?:chrome|chromium)\b/i);

  const state = await runCommand(
    CONTAINER_CLI,
    ['inspect', '--format', '{{json .State}}', CONTAINER_NAME],
  );
  receipt.container.stateBeforeStop = JSON.parse(state.stdout);
  const logs = await runCommand(CONTAINER_CLI, ['logs', CONTAINER_NAME]);
  receipt.container.logTail = logs.stdout;
  receipt.container.errorLogTail = logs.stderr;
  receipt.container.logTruncated = logs.stdoutTruncated || logs.stderrTruncated;

  const stop = await runCommand(CONTAINER_CLI, ['stop', '--time', '10', CONTAINER_NAME]);
  receipt.container.stopOutput = stop.stdout.trim();
  receipt.container.stopped = true;
  receipt.container.residualContainerIds = await residualContainerIds(CONTAINER_NAME);
  assert.deepEqual(receipt.container.residualContainerIds, []);

  receipt.status = 'passed';
} catch (error) {
  processFailed = true;
  receipt.status = 'failed';
  receipt.failure = failureValue(error);
  console.error(error);
} finally {
  try {
    receipt.cleanup = await removeContainer(CONTAINER_NAME);
    receipt.container.residualContainerIds = receipt.cleanup.residualContainerIds;
  } catch (cleanupError) {
    processFailed = true;
    receipt.status = 'failed';
    receipt.cleanup = { attempted: true, failure: failureValue(cleanupError) };
  }
  receipt.endedAt = new Date().toISOString();
  try {
    receipt.receiptBytes = await writeBoundedReceipt(receipt);
    console.log(`Gate 0 receipt: ${RECEIPT_PATH}`);
  } catch (receiptError) {
    processFailed = true;
    console.error(receiptError);
  }
}

if (processFailed || receipt.status !== 'passed') process.exitCode = 1;
