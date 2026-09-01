import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const submissionRoot = path.join(projectRoot, 'submission');
const modeArgument = process.argv.slice(2).find((value) => value.startsWith('--mode='));
const mode = modeArgument?.slice('--mode='.length) ?? 'pre-publication';
assert.ok(
  ['pre-publication', 'final'].includes(mode),
  'Mode must be --mode=pre-publication or --mode=final',
);
assert.equal(
  process.argv.slice(2).filter((value) => value !== modeArgument).length,
  0,
  'Unknown checker argument',
);
const requiredFiles = [
  'README.md',
  'official-requirements.md',
  'devpost-final-copy.md',
  'youtube-upload-copy.md',
  'gallery-assets.md',
  'challenge-period-provenance.md',
  'external-actions.md',
  'demo-video-script.md',
  'evidence-and-claims.md',
  'publication-checklist.md',
];
const knownMaterialFiles = new Set([...requiredFiles, 'devpost-application.md']);

const documents = new Map();
for (const name of requiredFiles) {
  documents.set(name, await readFile(path.join(submissionRoot, name), 'utf8'));
}
const publicSurfaceDocuments = new Map(documents);
publicSurfaceDocuments.set(
  'root/README.md',
  await readFile(path.join(projectRoot, 'README.md'), 'utf8'),
);
publicSurfaceDocuments.set(
  'submission/devpost-application.md',
  await readFile(path.join(submissionRoot, 'devpost-application.md'), 'utf8'),
);

const requireText = (file, values) => {
  const content = documents.get(file);
  for (const value of values) {
    assert.ok(content.includes(value), `${file} must include ${JSON.stringify(value)}`);
  }
};

requireText('official-requirements.md', [
  'https://webmcp.devpost.com/',
  'https://webmcp.devpost.com/rules',
  '2026-09-03 13:00 PDT',
  'Challenge-period provenance',
  'Depicted-versus-tested consistency',
  'Third-party integrations and intellectual property',
  'Representative authorization',
  'Prohibited support',
  'Judge access window',
  'Chrome 149 or later',
  'chrome://flags/#enable-webmcp-testing',
  'Public rules versus live form',
]);

requireText('devpost-final-copy.md', [
  'Why it is a strong use of WebMCP',
  'How it improves the user experience',
  'What people and agents can do together now',
  'How we built it',
  'Challenges we ran into',
  'Accomplishments that we are proud of',
  "What's next",
  'Testing instructions',
  'Challenge-period provenance',
  'document.modelContext.registerTool',
  'https://savs-webmcp-challenge.onrender.com',
  'https://youtu.be/quJI1JD3FzE',
]);

requireText('publication-checklist.md', [
  'Representative',
  'financial or preferential support',
  'Challenge-period provenance',
  'third-party dependency and asset',
  'Chrome 149 or later',
  'chrome://flags/#enable-webmcp-testing',
  'Judging-period availability',
  '2026-09-21 17:00 PDT',
  'live-form field map',
]);

const placeholders = ['<PUBLIC_REPOSITORY_URL>'];
const finalRejectedPlaceholders = [
  '<LIVE_URL>',
  '<PUBLIC_REPOSITORY_URL>',
  '<YOUTUBE_DEMO_URL>',
];
const youtubeUrl = 'https://youtu.be/quJI1JD3FzE';
if (mode === 'pre-publication') {
  for (const placeholder of placeholders) {
    for (const file of ['README.md', 'devpost-final-copy.md', 'publication-checklist.md']) {
      assert.ok(documents.get(file).includes(placeholder), `${file} must include ${placeholder}`);
    }
  }
  for (const file of ['README.md', 'devpost-final-copy.md', 'publication-checklist.md', 'youtube-upload-copy.md']) {
    assert.ok(documents.get(file).includes(youtubeUrl), `${file} must include ${youtubeUrl}`);
  }
  for (const [name, content] of publicSurfaceDocuments) {
    assert.equal(content.includes('<LIVE_URL>'), false, `${name} still contains <LIVE_URL>`);
    assert.equal(content.includes('<YOUTUBE_DEMO_URL>'), false, `${name} still contains <YOUTUBE_DEMO_URL>`);
  }
} else {
  for (const [name, content] of publicSurfaceDocuments) {
    for (const placeholder of finalRejectedPlaceholders) {
      assert.equal(content.includes(placeholder), false, `${name} still contains ${placeholder}`);
    }
  }

  const application = documents.get('devpost-final-copy.md');
  const fieldUrl = (label) => {
    const value = new RegExp(`^- \\*\\*${label}:\\*\\* (https:\\/\\/\\S+)$`, 'm').exec(application)?.[1];
    assert.ok(value, `${label} must be a real HTTPS URL in final mode`);
    return new URL(value);
  };
  const liveUrl = fieldUrl('Live app');
  const repositoryUrl = fieldUrl('Source code');
  const videoUrl = fieldUrl('Demo video');
  assert.ok(liveUrl.hostname, 'Live app hostname is required');
  assert.ok(
    ['github.com', 'gitlab.com', 'bitbucket.org'].includes(repositoryUrl.hostname),
    'Source repository must use an allowed public repository host',
  );
  assert.ok(
    ['youtube.com', 'www.youtube.com', 'youtu.be'].includes(videoUrl.hostname),
    'Demo video must use a YouTube URL',
  );
}

for (const [name, content] of documents) {
  assert.equal(/[\u3400-\u9fff]/u.test(content), false, `${name} contains a Han character`);
  for (const [, target] of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(target)) continue;
    assert.ok(knownMaterialFiles.has(target), `${name} links to unknown material ${target}`);
  }
}

const parseClock = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  assert.ok(match, `Invalid duration ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
};

const script = documents.get('demo-video-script.md');
const spoken = /Declared spoken runtime: \*\*(\d{2}:\d{2})\*\*/.exec(script)?.[1];
const hardStop = /Recording hard stop: \*\*(\d{2}:\d{2})\*\*/.exec(script)?.[1];
const ruleLimit = /Rule limit: \*\*(\d{2}:\d{2})\*\*/.exec(script)?.[1];
const margin = /Contingency margin: \*\*(\d{2}:\d{2})\*\*/.exec(script)?.[1];
assert.ok(spoken && hardStop && ruleLimit && margin, 'Demo timing declarations are required');
assert.ok(parseClock(spoken) <= parseClock(hardStop), 'Spoken runtime exceeds recording hard stop');
assert.ok(parseClock(hardStop) < parseClock(ruleLimit), 'Recording hard stop must be below rule limit');
assert.equal(parseClock(ruleLimit) - parseClock(hardStop), parseClock(margin), 'Contingency margin is inconsistent');
assert.equal(parseClock(ruleLimit), 180, 'Official video rule limit must be 03:00');

const application = documents.get('devpost-final-copy.md');
for (const tool of [
  'get_visual_state',
  'apply_compact_layout',
  'run_visual_audit',
  'apply_alignment_repair',
]) {
  assert.ok(application.includes(tool), `Application must name ${tool}`);
}

for (const phrase of [
  'The app is publicly deployed.',
  'The repository is public.',
  'The video is public.',
  'The submission is complete.',
]) {
  for (const [name, content] of publicSurfaceDocuments) {
    assert.equal(content.includes(phrase), false, `${name} contains unproven completion claim: ${phrase}`);
  }
}

const hashes = Object.fromEntries(
  [...publicSurfaceDocuments].map(([name, content]) => [
    name.startsWith('root/') || name.startsWith('submission/') ? name : `submission/${name}`,
    createHash('sha256').update(content).digest('hex'),
  ]),
);

console.log(JSON.stringify({
  ok: true,
  checker: 'submission-materials-v1',
  mode,
  files: publicSurfaceDocuments.size,
  hanCharactersAbsent: true,
  assertionScope: 'syntactic inventory, required markers, declared timing, relative links, complete public-surface placeholders, and exact prohibited completion sentences',
  liveFormInventory: 'pending external gate',
  spokenRuntimeSeconds: parseClock(spoken),
  recordingHardStopSeconds: parseClock(hardStop),
  ruleLimitSeconds: parseClock(ruleLimit),
  contingencyMarginSeconds: parseClock(margin),
  placeholders,
  boundYoutubeUrl: youtubeUrl,
  finalRejectedPlaceholders,
  hashes,
}, null, 2));
