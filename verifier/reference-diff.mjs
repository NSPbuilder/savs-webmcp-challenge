import { decodePng, encodePng, sha256 } from './png.mjs';

function requireTarget(target, width, height) {
  const { id, x, y, width: targetWidth, height: targetHeight } = target ?? {};
  if (typeof id !== 'string' || id.length === 0) throw new Error('Target id is required');
  for (const [name, value] of Object.entries({ x, y, targetWidth, targetHeight })) {
    if (!Number.isInteger(value)) throw new Error(`Target ${id} ${name} must be an integer`);
  }
  if (
    x < 0 ||
    y < 0 ||
    targetWidth < 1 ||
    targetHeight < 1 ||
    x + targetWidth > width ||
    y + targetHeight > height
  ) {
    throw new Error(`Target ${id} is outside the raster`);
  }
  return { id, x, y, width: targetWidth, height: targetHeight };
}

function includes(target, x, y) {
  return (
    x >= target.x &&
    x < target.x + target.width &&
    y >= target.y &&
    y < target.y + target.height
  );
}

export function compareRgba(reference, current, { targets = [] } = {}) {
  if (reference.width !== current.width || reference.height !== current.height) {
    throw new Error('Raster dimensions differ');
  }
  const { width, height } = reference;
  const referenceRgba = Buffer.from(reference.rgba);
  const currentRgba = Buffer.from(current.rgba);
  if (referenceRgba.length !== width * height * 4 || currentRgba.length !== referenceRgba.length) {
    throw new Error('Raster RGBA byte length mismatch');
  }
  const registeredTargets = targets.map((target) => requireTarget(target, width, height));
  if (new Set(registeredTargets.map((target) => target.id)).size !== registeredTargets.length) {
    throw new Error('Target ids must be unique');
  }

  const targetCounts = new Map(registeredTargets.map((target) => [target.id, 0]));
  const diffRgba = Buffer.alloc(width * height * 4);
  let changedPixels = 0;
  let outsideTargetPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const changed =
        referenceRgba[offset] !== currentRgba[offset] ||
        referenceRgba[offset + 1] !== currentRgba[offset + 1] ||
        referenceRgba[offset + 2] !== currentRgba[offset + 2] ||
        referenceRgba[offset + 3] !== currentRgba[offset + 3];
      if (changed) {
        changedPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        const owners = registeredTargets.filter((target) => includes(target, x, y));
        if (owners.length === 0) outsideTargetPixels += 1;
        for (const owner of owners) targetCounts.set(owner.id, targetCounts.get(owner.id) + 1);
        diffRgba.set([211, 71, 53, 255], offset);
      } else {
        const luminance = Math.round(
          referenceRgba[offset] * 0.2126 +
            referenceRgba[offset + 1] * 0.7152 +
            referenceRgba[offset + 2] * 0.0722,
        );
        const neutral = Math.round(244 - (255 - luminance) * 0.12);
        diffRgba.set([neutral, neutral, neutral, 255], offset);
      }
    }
  }

  const bounds = changedPixels === 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const targetCoverage = registeredTargets.map((target) => ({
    ...target,
    changedPixels: targetCounts.get(target.id),
    hasDifference: targetCounts.get(target.id) > 0,
  }));
  const diffPng = encodePng({ width, height, rgba: diffRgba });
  return {
    width,
    height,
    changedPixels,
    outsideTargetPixels,
    bounds,
    targetCoverage,
    targetCandidates: targetCoverage.filter((target) => target.hasDifference).map((target) => target.id),
    diffRgba,
    diffPng,
    diffSha256: sha256(diffPng),
  };
}

export function comparePngBuffers(referencePng, currentPng, options = {}) {
  const reference = decodePng(referencePng);
  const current = decodePng(currentPng);
  return {
    referenceSha256: sha256(referencePng),
    currentSha256: sha256(currentPng),
    ...compareRgba(reference, current, options),
  };
}

export function serializableComparison(comparison) {
  const { diffPng: _diffPng, diffRgba: _diffRgba, ...result } = comparison;
  return result;
}
