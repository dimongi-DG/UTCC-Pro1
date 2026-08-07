const fs = require('node:fs/promises');
const path = require('node:path');
const { ASSET_DIRS } = require('../shared/constants');
const { sanitizeFilename, assertRelativePath, isWithin } = require('./validators');

const LIMITS = { character: 20, storyboardImage: 30, video: 1200, voice: 100, music: 300, sfx: 100 };
function detect(bytes) {
  const hex = bytes.toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', ext: '.png' };
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: '.jpg' };
  if (bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
  if (bytes.slice(4, 8).toString() === 'ftyp') return { mime: 'video/mp4', ext: '.mp4' };
  if (hex.startsWith('1a45dfa3')) return { mime: 'video/webm', ext: '.webm' };
  if (bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WAVE') return { mime: 'audio/wav', ext: '.wav' };
  if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3')) return { mime: 'audio/mpeg', ext: '.mp3' };
  if (bytes.slice(4, 8).toString() === 'ftyp' && /M4A/.test(bytes.toString('ascii'))) return { mime: 'audio/mp4', ext: '.m4a' };
  if (bytes.slice(0, 4).toString() === 'OggS') return { mime: 'audio/ogg', ext: '.ogg' };
  return null;
}
function allowed(kind, mime) {
  if (['character', 'storyboardImage'].includes(kind)) return mime.startsWith('image/');
  if (kind === 'video') return mime.startsWith('video/');
  return ['voice', 'music', 'sfx'].includes(kind) && mime.startsWith('audio/');
}
async function importAsset(root, source, kind) {
  if (!ASSET_DIRS[kind]) throw new Error('Unsupported asset kind');
  const stat = await fs.stat(source);
  if (stat.size > LIMITS[kind] * 1024 * 1024) throw new Error(`File exceeds ${LIMITS[kind]} MB limit`);
  const handle = await fs.open(source, 'r');
  const buffer = Buffer.alloc(32);
  await handle.read(buffer, 0, 32, 0); await handle.close();
  const type = detect(buffer);
  if (!type || !allowed(kind, type.mime)) throw new Error('File signature does not match an allowed media type');
  const dir = ASSET_DIRS[kind];
  const stem = sanitizeFilename(path.basename(source, path.extname(source)));
  const name = `${Date.now()}-${stem}${type.ext}`;
  const relativePath = path.posix.join(dir, name);
  await fs.copyFile(source, path.join(root, ...relativePath.split('/')));
  return { relativePath, mime: type.mime, name: path.basename(source), size: stat.size };
}
async function removeAsset(root, relativePath) {
  assertRelativePath(relativePath);
  const full = path.resolve(root, relativePath);
  if (!isWithin(root, full)) throw new Error('Invalid asset path');
  await fs.unlink(full).catch(error => { if (error.code !== 'ENOENT') throw error; });
  return { removed: true };
}
module.exports = { detect, importAsset, removeAsset };
