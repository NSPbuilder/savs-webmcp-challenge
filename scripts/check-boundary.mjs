import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_ROOTS = ['.github/workflows', 'app', 'lib', 'scripts', 'tests', 'verifier'];
const SOURCE_FILES = [
  'server.mjs',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'README.md',
  '.gitignore',
  'Dockerfile',
  '.dockerignore',
];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.md', '.css', '.html', '.yml']);
const privateProject = ['nsp', 'savs'].join('-');
const privateCore = ['nsp', 'core'].join('_');
const staticImportPattern = new RegExp(
  `\\b(?:import|export)\\b[^\\n]*['"][^'"]*(?:${privateProject}|${privateCore}|\\.\\.\\/\\.\\.)`,
  'i',
);
const dynamicImportPattern = new RegExp(
  `\\bimport\\s*\\([^)]*['"][^'"]*(?:${privateProject}|${privateCore}|\\.\\.\\/\\.\\.)`,
  'i',
);
const findings = [];

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const paths = SOURCE_FILES.map((path) => join(ROOT, path));
for (const directory of SOURCE_ROOTS) paths.push(...await collect(join(ROOT, directory)));

for (const path of paths) {
  const name = relative(ROOT, path);
  const content = await readFile(path, 'utf8');
  if (!content.endsWith('\n')) findings.push(`${name}: missing final newline`);
  if (/\r/.test(content)) findings.push(`${name}: CR line ending`);
  if (/\t/.test(content)) findings.push(`${name}: tab character`);
  if (/ +$/m.test(content)) findings.push(`${name}: trailing whitespace`);
  if (/\/Volumes\/ssd\/projects\/NSP_codex\//.test(content)) {
    findings.push(`${name}: absolute workspace path`);
  }
  if (staticImportPattern.test(content)) {
    findings.push(`${name}: private or parent runtime import`);
  }
  if (dynamicImportPattern.test(content)) {
    findings.push(`${name}: dynamic private or parent runtime import`);
  }
}

const packageValue = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
assert.equal(packageValue.private, true, 'package must remain private');
assert.equal(packageValue.license, 'MIT', 'package license must be MIT');
assert.deepEqual(Object.keys(packageValue.dependencies || {}), ['playwright']);
assert.equal(packageValue.dependencies.playwright, '1.62.1');

const packageLockValue = JSON.parse(await readFile(join(ROOT, 'package-lock.json'), 'utf8'));
const lockRoot = packageLockValue.packages[''];
assert.equal(lockRoot.name, packageValue.name, 'root lockfile name must match package metadata');
assert.equal(lockRoot.version, packageValue.version, 'root lockfile version must match package metadata');
assert.equal(lockRoot.license, packageValue.license, 'root lockfile license must match package metadata');
assert.deepEqual(
  lockRoot.dependencies,
  packageValue.dependencies,
  'root lockfile dependencies must match package metadata',
);
assert.deepEqual(
  lockRoot.engines,
  packageValue.engines,
  'root lockfile engines must match package metadata',
);

const expectedMitLicense = `MIT License

Copyright (c) 2026 NSP AI LABS INC.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
assert.equal(
  await readFile(join(ROOT, 'LICENSE'), 'utf8'),
  expectedMitLicense,
  'LICENSE must contain the authorized standard MIT text',
);

const dockerfile = await readFile(join(ROOT, 'Dockerfile'), 'utf8');
assert.match(
  dockerfile,
  /^FROM mcr\.microsoft\.com\/playwright:v1\.62\.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e$/m,
);
assert.ok(!dockerfile.includes('COPY . .'), 'container must use an explicit runtime allowlist');
for (const instruction of [
  'COPY package.json package-lock.json ./',
  'RUN npm ci --omit=dev',
  'COPY app ./app',
  'COPY lib ./lib',
  'COPY verifier ./verifier',
  'COPY server.mjs ./',
  'CMD ["npm", "start"]',
]) assert.ok(dockerfile.includes(instruction), `Dockerfile missing: ${instruction}`);

const dockerIgnore = new Set((await readFile(join(ROOT, '.dockerignore'), 'utf8')).split('\n'));
for (const excluded of ['.git', '.nsp', 'node_modules', 'artifacts', 'docs', 'tests', 'scripts']) {
  assert.ok(dockerIgnore.has(excluded), `.dockerignore missing ${excluded}`);
}

const workflow = await readFile(
  join(ROOT, '.github', 'workflows', 'gate0-container-proof.yml'),
  'utf8',
);
assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
assert.match(workflow, /^permissions:\n  contents: read\n/m);
assert.match(workflow, /^    runs-on: ubuntu-24\.04$/m);
assert.match(workflow, /^    timeout-minutes: 30$/m);
assert.match(workflow, /^          persist-credentials: false$/m);
assert.match(workflow, /^          path: artifacts\/gate0-container-proof\/receipt\.json$/m);
assert.match(workflow, /^          if-no-files-found: ignore$/m);
assert.match(workflow, /^          retention-days: 1$/m);
for (const action of [
  'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
]) assert.ok(workflow.includes(action), `workflow missing exact action pin: ${action}`);
for (const forbidden of ['docker push', 'ghcr.io', 'actions/cache@', 'secrets.', 'environment:']) {
  assert.ok(!workflow.includes(forbidden), `workflow contains forbidden surface: ${forbidden}`);
}

const containerProof = await readFile(
  join(ROOT, 'scripts', 'run-gate0-container-proof.mjs'),
  'utf8',
);
for (const contract of [
  'const FIELD_LIMIT_BYTES = 65_536;',
  'const RECEIPT_LIMIT_BYTES = 1_048_576;',
  'const RUNNER_TOTAL_TIMEOUT_MS = 480_000;',
  'const RUNNER_FINALIZATION_RESERVE_MS = 60_000;',
  "'COMMAND_CLOSE_TIMEOUT'",
  "'RUNNER_OPERATION_TIMEOUT'",
  'GATE0_READINESS_TIMEOUT_MS',
  'new AbortController()',
  'const request = (async () =>',
  'controller.abort();',
  'child.unref?.()',
  'terminationVerified: closeObserved',
  "processTarget.on('beforeExit', onBeforeExit)",
  "writeFileSyncImpl(receiptPath, bytes, { flag: 'wx' })",
  'runnerDeadline.timeoutFor(timeoutMs)',
  'const IS_MAIN = process.argv[1]',
  "writeFileSyncImpl(receiptPath, bytes, { flag: 'wx' })",
  "['stop', '--time', '10', CONTAINER_NAME]",
  'finally {',
]) assert.ok(containerProof.includes(contract), `container proof missing contract: ${contract}`);
assert.match(
  containerProof,
  /\[\s*'run', '--detach', '--rm', '--init', '--ipc=host'/,
  'container proof must run with detach/rm/init/ipc host',
);

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scannedFiles: paths.length,
    privateRuntimeImports: 0,
    absoluteWorkspacePaths: 0,
    packagePrivate: true,
    license: 'MIT',
  }));
}
