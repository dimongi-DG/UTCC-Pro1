const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { sanitizeFilename, isWithin, assertRelativePath } = require('../src/main/validators');

test('sanitizes Windows reserved punctuation while preserving Thai', () => {
  assert.equal(sanitizeFilename('เรื่อง: ตอนที่ 1?.mp4'), 'เรื่อง_ ตอนที่ 1_.mp4');
});
test('prevents path traversal', () => {
  const root=path.resolve('project');
  assert.equal(isWithin(root,path.join(root,'video-clips','x.mp4')),true);
  assert.equal(isWithin(root,path.resolve(root,'..','secret')),false);
  assert.throws(()=>assertRelativePath('../secret'));
});
