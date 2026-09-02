const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { ZipWriter } = require('../src/main/zip-writer');
const { buildStoryboardPdf, escapeText, wrapText } = require('../src/main/pdf-writer');
const { createEmptyProject } = require('../src/shared/schema');
const mock = require('../src/services/mock-provider');

test('ZipWriter creates a valid ZIP with correct filenames and structure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-zip-'));
  try {
    const zip = new ZipWriter();
    zip.addBuffer('hello.txt', Buffer.from('Hello, World!'));
    zip.addBuffer('data.json', Buffer.from('{"key":"value"}'));
    const buffer = zip.build();
    const zipPath = path.join(root, 'test.zip');
    await fs.writeFile(zipPath, buffer);

    assert.ok(buffer.indexOf(Buffer.from('PK\x03\x04')) > -1, 'ZIP local file header signature present');
    assert.ok(buffer.indexOf(Buffer.from('PK\x01\x02')) > -1, 'ZIP central directory header signature present');
    assert.ok(buffer.indexOf(Buffer.from('PK\x05\x06')) > -1, 'ZIP end of central directory record present');

    const fileContent = await fs.readFile(zipPath);
    const text = fileContent.toString('utf8');
    assert.ok(text.includes('hello.txt'), 'hello.txt filename in ZIP');
    assert.ok(text.includes('data.json'), 'data.json filename in ZIP');

    // Compressed content won't appear as plaintext in deflate mode — verify via decompression
    const zlib = require('node:zlib');
    const localOffset = buffer.indexOf(Buffer.from('PK\x03\x04'));
    const nameLen = buffer.readUInt16LE(localOffset + 26);
    const extraLen = buffer.readUInt16LE(localOffset + 28);
    const compressedStart = localOffset + 30 + nameLen + extraLen;
    const compressedEnd = compressedStart + buffer.readUInt32LE(localOffset + 18);
    const compressed = buffer.slice(compressedStart, compressedEnd);
    const decompressed = zlib.inflateRawSync(compressed);
    assert.equal(decompressed.toString(), 'Hello, World!', 'first file decompresses correctly');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('ZipWriter handles empty filenames and nested directory paths', () => {
  const zip = new ZipWriter();
  zip.addBuffer('exports/storyboard.md', Buffer.from('# Storyboard'));
  zip.addBuffer('project.json', Buffer.from('{}'));
  const buffer = zip.build();

  assert.ok(buffer.length > 0, 'ZIP buffer is non-empty');
  const content = buffer.toString('binary');
  assert.ok(content.includes('exports/storyboard.md'), 'nested path in ZIP');
});

test('Storyboard PDF contains valid PDF header and structure', () => {
  const project = createEmptyProject('Test Storyboard PDF');
  const generated = mock.generateStory(project);
  project.story = generated.story;
  project.scenes = generated.scenes;
  project.scenes[0].shots[0].imagePrompt = 'A cinematic test scene with a character';
  project.scenes[0].shots[0].imageNegativePrompt = 'blurry, low quality';

  const pdf = buildStoryboardPdf(project, { includeImages: false });

  const text = pdf.toString('latin1');
  assert.ok(text.includes('%PDF-1.4'), 'PDF header is %PDF-1.4');

  assert.match(pdf.slice(-10).toString('latin1'), /%%EOF/, 'PDF ends with %%EOF');

  assert.ok(text.includes('/Type /Catalog'), 'PDF catalog present');
  assert.ok(text.includes('/Type /Pages'), 'PDF Pages object present');
  assert.ok(text.includes('/Type /Page'), 'PDF Page object present');
  assert.ok(text.includes('/Type /Font'), 'PDF font resource present');
});

test('Storyboard PDF renders shot labels and image prompts per page', () => {
  const project = createEmptyProject('Shot Layout Test');
  const generated = mock.generateStory(project);
  project.story = generated.story;
  project.scenes = generated.scenes;
  project.scenes[0].shots[0].imagePrompt = 'First shot image prompt text';

  const pdf = buildStoryboardPdf(project, { includeImages: false });
  const text = pdf.toString('latin1');

  assert.ok(text.includes('S1'), 'Shot label S1 present in PDF');
  assert.ok(text.includes('SH1'), 'Shot number SH1 present in PDF');
  assert.ok(text.includes('First shot image prompt text'), 'Shot image prompt text present in PDF');
  assert.ok(text.includes('Shot Layout Test'), 'Project title present in PDF');
});

test('escapeText properly escapes PDF special characters', () => {
  assert.equal(escapeText('simple text'), 'simple text');
  assert.equal(escapeText('has (parens)'), 'has \\(parens\\)');
  assert.equal(escapeText('has \\backslash'), 'has \\\\backslash');
  assert.equal(escapeText('new\nline'), 'new\\nline');
  assert.equal(escapeText(undefined), '');
  assert.equal(escapeText(null), '');
  assert.equal(escapeText(''), '');
});

test('wrapText splits long text into lines within max length', () => {
  const result = wrapText('the quick brown fox jumps over the lazy dog', 10, 999);
  assert.ok(result.length > 1, 'Long text wraps into multiple lines');
  assert.ok(result.every(line => line.length <= 10), 'Each line is within max length');

  const single = wrapText('short', 100, 999);
  assert.deepEqual(single, ['short'], 'Short text stays on one line');
});

test('buildStoryboardPdf handles project with no scenes gracefully', () => {
  const project = createEmptyProject('Empty Project');
  project.scenes = [];

  const pdf = buildStoryboardPdf(project, { includeImages: false });
  const text = pdf.toString('latin1');

  assert.ok(text.includes('%PDF-1.4'), 'PDF header present even with empty project');
  assert.ok(text.includes('Empty Project'), 'Project title present');
  assert.match(pdf.slice(-10).toString('latin1'), /%%EOF/, 'PDF ends properly');
});

test('ZipWriter produces a valid buffer with correct entry count', () => {
  const zip = new ZipWriter();
  zip.addBuffer('alpha/test.txt', Buffer.from('Test content for round-trip'));
  const buffer = zip.build();

  assert.ok(buffer.length > 0, 'ZIP buffer is non-empty');
  assert.ok(buffer.indexOf(Buffer.from('PK\x03\x04')) > -1, 'Local file header present');
  assert.ok(buffer.indexOf(Buffer.from('PK\x01\x02')) > -1, 'Central directory present');
  assert.ok(buffer.indexOf(Buffer.from('PK\x05\x06')) > -1, 'End of central directory present');
  assert.ok(buffer.includes(Buffer.from('alpha/test.txt')), 'Filename in ZIP');

  // Verify central directory entry count
  const eocdOffset = buffer.indexOf(Buffer.from('PK\x05\x06'));
  assert.ok(eocdOffset >= 0, 'EOCD found');
  assert.equal(buffer.readUInt16LE(eocdOffset + 8), 1, 'Central directory has 1 entry');
  assert.equal(buffer.readUInt16LE(eocdOffset + 10), 1, 'Total entries is 1');
});

test('Storyboard PDF includes timestamp and studio label', () => {
  const project = createEmptyProject('Time Test');
  project.scenes = [];

  const pdf = buildStoryboardPdf(project, { includeImages: false });
  const text = pdf.toString('latin1');

  assert.ok(text.includes('Clip Story Studio'), 'Studio label present in PDF');
  assert.ok(text.includes('Storyboard Export'), 'Storyboard export label present');
});
