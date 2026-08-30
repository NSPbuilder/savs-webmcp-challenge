import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePng, encodePng, sha256 } from '../verifier/png.mjs';

test('RGBA PNG round-trips byte exactly', () => {
  const rgba = Buffer.from([
    1, 2, 3, 255,
    4, 5, 6, 128,
    7, 8, 9, 0,
    10, 11, 12, 64,
  ]);
  const png = encodePng({ width: 2, height: 2, rgba });
  const decoded = decodePng(png);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.rgba, rgba);
  assert.match(sha256(png), /^[a-f0-9]{64}$/);
});

test('decoder rejects malformed, oversized, trailing, and CRC-corrupt input', () => {
  assert.throws(() => decodePng(Buffer.from('not png')), /signature/);
  assert.throws(
    () => encodePng({ width: 5000, height: 1, rgba: Buffer.alloc(5000 * 4) }),
    /out of bounds/,
  );
  const png = encodePng({ width: 1, height: 1, rgba: Buffer.from([1, 2, 3, 4]) });
  assert.throws(() => decodePng(Buffer.concat([png, Buffer.from([0])])), /Trailing/);
  const corrupt = Buffer.from(png);
  corrupt[20] ^= 1;
  assert.throws(() => decodePng(corrupt), /CRC mismatch/);
});
