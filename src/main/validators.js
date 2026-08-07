const path = require('node:path');

function sanitizeFilename(name) {
  const safe = String(name || 'asset')
    .normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '').replace(/^\.+/g, '').slice(0, 120);
  return safe || 'asset';
}
function isWithin(root, candidate) {
  const base = path.resolve(root) + path.sep;
  const target = path.resolve(candidate);
  return target.startsWith(base) && target !== path.resolve(root);
}
function safeNumber(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}
function assertProjectPayload(project) {
  if (!project || typeof project !== 'object' || typeof project.id !== 'string') throw new Error('Invalid project payload');
  const serialized = JSON.stringify(project);
  if (serialized.length > 15_000_000) throw new Error('Project data is too large');
}
function assertRelativePath(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('..')) throw new Error('Invalid relative path');
}
module.exports = { sanitizeFilename, isWithin, safeNumber, assertProjectPayload, assertRelativePath };
