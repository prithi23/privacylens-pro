// Generate original, deterministic PNG shield icons without external image dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(
  new URL('../apps/extension/public/icons/', import.meta.url),
);
mkdirSync(directory, { recursive: true });
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}
for (const size of [16, 32, 48, 128]) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const width = ny < 0.52 ? 0.31 : 0.31 * (1 - (ny - 0.52) / 0.38);
      const shield =
        ny > 0.16 &&
        ny < 0.88 &&
        Math.abs(nx - 0.5) < width &&
        ny > 0.13 + Math.abs(nx - 0.5) * 0.3;
      const innerWidth = ny < 0.51 ? 0.22 : 0.22 * (1 - (ny - 0.51) / 0.26);
      const inner = ny > 0.25 && ny < 0.77 && Math.abs(nx - 0.5) < innerWidth;
      const color = shield && !inner ? [34, 211, 238, 255] : [16, 24, 39, 255];
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      color.forEach((value, channel) => {
        rows[offset + channel] = value;
      });
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `${directory}/icon${size}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
