import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_777_216;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return result;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function requireDimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  ) {
    throw new Error(`PNG dimensions out of bounds: ${width}×${height}`);
  }
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function decodePng(input) {
  const buffer = Buffer.from(input);
  if (buffer.length > MAX_INPUT_BYTES) throw new Error('PNG exceeds input byte limit');
  if (buffer.length < SIGNATURE.length || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  let cursor = 8;
  let header = null;
  let sawEnd = false;
  const dataChunks = [];
  while (cursor < buffer.length) {
    if (cursor + 12 > buffer.length) throw new Error('Truncated PNG chunk');
    const length = buffer.readUInt32BE(cursor);
    const end = cursor + 12 + length;
    if (end > buffer.length) throw new Error('PNG chunk length exceeds input');
    const type = buffer.toString('ascii', cursor + 4, cursor + 8);
    const data = buffer.subarray(cursor + 8, cursor + 8 + length);
    const expectedCrc = buffer.readUInt32BE(cursor + 8 + length);
    const actualCrc = crc32(buffer.subarray(cursor + 4, cursor + 8 + length));
    if (expectedCrc !== actualCrc) throw new Error(`PNG CRC mismatch in ${type}`);
    if (type === 'IHDR') {
      if (header || length !== 13) throw new Error('Invalid PNG IHDR');
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
      requireDimensions(header.width, header.height);
      if (
        header.bitDepth !== 8 ||
        ![2, 6].includes(header.colorType) ||
        header.compression !== 0 ||
        header.filter !== 0 ||
        header.interlace !== 0
      ) {
        throw new Error('PNG must be non-interlaced 8-bit RGB or RGBA');
      }
    } else if (type === 'IDAT') {
      if (!header) throw new Error('PNG IDAT precedes IHDR');
      dataChunks.push(data);
    } else if (type === 'IEND') {
      sawEnd = true;
      cursor = end;
      break;
    }
    cursor = end;
  }
  if (!header || !sawEnd || dataChunks.length === 0) throw new Error('Incomplete PNG');
  if (cursor !== buffer.length) throw new Error('Trailing PNG bytes are not accepted');

  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const expectedInflated = (stride + 1) * header.height;
  const compressed = Buffer.concat(dataChunks);
  const raw = inflateSync(compressed, { maxOutputLength: expectedInflated });
  if (raw.length !== expectedInflated) throw new Error('Unexpected PNG raster size');

  const decoded = Buffer.allocUnsafe(stride * header.height);
  for (let row = 0; row < header.height; row += 1) {
    const rawOffset = row * (stride + 1);
    const outputOffset = row * stride;
    const filter = raw[rawOffset];
    if (filter > 4) throw new Error(`Unsupported PNG filter ${filter}`);
    for (let column = 0; column < stride; column += 1) {
      const source = raw[rawOffset + 1 + column];
      const left = column >= channels ? decoded[outputOffset + column - channels] : 0;
      const above = row > 0 ? decoded[outputOffset + column - stride] : 0;
      const upperLeft = row > 0 && column >= channels
        ? decoded[outputOffset + column - stride - channels]
        : 0;
      let value = source;
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) value += paeth(left, above, upperLeft);
      decoded[outputOffset + column] = value & 0xff;
    }
  }

  const rgba = Buffer.allocUnsafe(header.width * header.height * 4);
  for (let pixel = 0; pixel < header.width * header.height; pixel += 1) {
    rgba[pixel * 4] = decoded[pixel * channels];
    rgba[pixel * 4 + 1] = decoded[pixel * channels + 1];
    rgba[pixel * 4 + 2] = decoded[pixel * channels + 2];
    rgba[pixel * 4 + 3] = channels === 4 ? decoded[pixel * channels + 3] : 255;
  }
  return { width: header.width, height: header.height, rgba };
}

export function encodePng({ width, height, rgba }) {
  requireDimensions(width, height);
  const pixels = Buffer.from(rgba);
  if (pixels.length !== width * height * 4) throw new Error('RGBA byte length mismatch');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.allocUnsafe((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (width * 4 + 1);
    rows[rowOffset] = 0;
    pixels.copy(rows, rowOffset + 1, row * width * 4, (row + 1) * width * 4);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
