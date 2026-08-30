import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_ROOTS = ['app', 'lib', 'scripts', 'tests', 'verifier'];
const SOURCE_FILES = ['server.mjs', 'package.json', 'README.md', '.gitignore'];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.md', '.css', '.html']);
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
assert.equal(packageValue.license, 'UNLICENSED', 'license must remain UNLICENSED');
assert.deepEqual(Object.keys(packageValue.dependencies || {}), ['playwright']);
assert.equal(packageValue.dependencies.playwright, '1.62.1');

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
    license: 'UNLICENSED',
  }));
}
