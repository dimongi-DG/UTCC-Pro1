const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

const UTF8_FLAG = 0x800;
const VERSION = 20;

function dosDateTime(date = new Date()) {
  const d = Math.max(1, Math.min(31, date.getDate()));
  const m = Math.max(1, Math.min(12, date.getMonth() + 1));
  const y = Math.max(1980, Math.min(2107, date.getFullYear()));
  const h = date.getHours();
  const min = date.getMinutes();
  const s = Math.floor(date.getSeconds() / 2);
  return { date: ((y - 1980) << 9) | (m << 5) | d, time: (h << 11) | (min << 5) | s };
}

function crc32(buffer) {
  return zlib.crc32(buffer);
}

function compress(data) {
  return zlib.deflateRawSync(Buffer.isBuffer(data) ? data : Buffer.from(data));
}

class ZipWriter {
  constructor() {
    this.entries = [];
    this.offsets = [];
  }

  addBuffer(relativePath, data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.entries.push({ name: relativePath, data: buffer });
    return this;
  }

  async addFile(root, relativePath) {
    const full = path.join(root, relativePath);
    const data = await fsp.readFile(full);
    this.addBuffer(relativePath, data);
    return this;
  }

  build() {
    const locals = [];
    const central = [];
    const time = dosDateTime();
    let offset = 0;

    for (const entry of this.entries) {
      const compressed = compress(entry.data);
      const name = Buffer.from(entry.name, 'utf8');
      const crc = zlib.crc32(entry.data);

      // Local file header
      const local = Buffer.alloc(30 + name.length);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(VERSION, 4);
      local.writeUInt16LE(UTF8_FLAG, 6);
      local.writeUInt16LE(8, 8); // deflate
      local.writeUInt16LE(time.time, 10);
      local.writeUInt16LE(time.date, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(entry.data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      name.copy(local, 30);

      locals.push({ header: local, data: compressed, compressedSize: compressed.length, uncompressedSize: entry.data.length, crc, nameLength: name.length });
      central.push({ name: entry.name, nameLength: name.length, crc, compressedSize: compressed.length, uncompressedSize: entry.data.length, localHeaderOffset: offset, time });
      offset += local.length + compressed.length;
    }

    let buf = Buffer.concat(locals.flatMap(l => [l.header, l.data]));

    const cdStart = buf.length;
    for (const entry of central) {
      const name = Buffer.from(entry.name, 'utf8');
      const cd = Buffer.alloc(46 + name.length);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(VERSION, 4);
      cd.writeUInt16LE(VERSION, 6);
      cd.writeUInt16LE(UTF8_FLAG, 8);
      cd.writeUInt16LE(8, 10);
      cd.writeUInt16LE(entry.time.time, 12);
      cd.writeUInt16LE(entry.time.date, 14);
      cd.writeUInt32LE(entry.crc, 16);
      cd.writeUInt32LE(entry.compressedSize, 20);
      cd.writeUInt32LE(entry.uncompressedSize, 24);
      cd.writeUInt16LE(entry.nameLength, 28);
      cd.writeUInt16LE(0, 30);
      cd.writeUInt16LE(0, 32);
      cd.writeUInt16LE(0, 34);
      cd.writeUInt16LE(0, 36);
      cd.writeUInt32LE(0, 38);
      cd.writeUInt32LE(entry.localHeaderOffset, 42);
      name.copy(cd, 46);
      buf = Buffer.concat([buf, cd]);
    }

    const cdEnd = buf.length - cdStart;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(cdEnd, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);
    buf = Buffer.concat([buf, eocd]);

    return buf;
  }
}

module.exports = { ZipWriter, compress, dosDateTime };
