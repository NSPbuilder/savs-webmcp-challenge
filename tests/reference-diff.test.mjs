import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePng, encodePng, sha256 } from '../verifier/png.mjs';
import {
  comparePngBuffers,
  serializableComparison,
} from '../verifier/reference-diff.mjs';

function raster(width, height, color = [244, 245, 240, 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(color, offset);
  return rgba;
}

function paint(rgba, width, x, y, color) {
  rgba.set(color, (y * width + x) * 4);
}

test('exact comparison localizes two candidates and emits independently verifiable diff', () => {
  const width = 10;
  const height = 4;
  const referenceRgba = raster(width, height);
  const currentRgba = Buffer.from(referenceRgba);
  paint(currentRgba, width, 1, 1, [0, 0, 0, 255]);
  paint(currentRgba, width, 2, 1, [0, 0, 0, 255]);
  paint(currentRgba, width, 7, 2, [0, 0, 0, 255]);
  const reference = encodePng({ width, height, rgba: referenceRgba });
  const current = encodePng({ width, height, rgba: currentRgba });
  const result = comparePngBuffers(reference, current, {
    targets: [
      { id: 'css-value', x: 0, y: 0, width: 4, height: 3 },
      { id: 'device-value', x: 6, y: 1, width: 4, height: 3 },
    ],
  });

  assert.equal(result.changedPixels, 3);
  assert.equal(result.outsideTargetPixels, 0);
  assert.deepEqual(result.targetCandidates, ['css-value', 'device-value']);
  assert.deepEqual(result.bounds, { x: 1, y: 1, width: 7, height: 2 });
  assert.equal(result.diffSha256, sha256(result.diffPng));

  const decodedDiff = decodePng(result.diffPng);
  let redPixels = 0;
  for (let offset = 0; offset < decodedDiff.rgba.length; offset += 4) {
    if (
      decodedDiff.rgba[offset] === 211 &&
      decodedDiff.rgba[offset + 1] === 71 &&
      decodedDiff.rgba[offset + 2] === 53
    ) {
      redPixels += 1;
    }
  }
  assert.equal(redPixels, result.changedPixels);
  assert.equal('diffPng' in serializableComparison(result), false);
});

test('stable control is exactly zero and an outside change is counted', () => {
  const rgba = raster(3, 2);
  const reference = encodePng({ width: 3, height: 2, rgba });
  const stable = comparePngBuffers(reference, Buffer.from(reference), {
    targets: [{ id: 'only', x: 0, y: 0, width: 1, height: 1 }],
  });
  assert.equal(stable.changedPixels, 0);
  assert.equal(stable.bounds, null);

  const changed = Buffer.from(rgba);
  paint(changed, 3, 2, 1, [1, 2, 3, 255]);
  const outside = comparePngBuffers(reference, encodePng({ width: 3, height: 2, rgba: changed }), {
    targets: [{ id: 'only', x: 0, y: 0, width: 1, height: 1 }],
  });
  assert.equal(outside.outsideTargetPixels, 1);
});

test('comparison refuses mismatched dimensions and invalid targets', () => {
  const one = encodePng({ width: 1, height: 1, rgba: raster(1, 1) });
  const two = encodePng({ width: 2, height: 1, rgba: raster(2, 1) });
  assert.throws(() => comparePngBuffers(one, two), /dimensions differ/);
  assert.throws(
    () => comparePngBuffers(one, one, { targets: [{ id: 'bad', x: 0, y: 0, width: 2, height: 1 }] }),
    /outside/,
  );
});
