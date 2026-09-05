const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TEMPLATE_LIMIT, LEGACY_TEMPLATE_FINGERPRINTS, templateFingerprint, isLegacyDefaultTemplate,
  defaultPromptTemplates, normalizePromptTemplates, validatePromptTemplates, renderPromptTemplate,
  storyPromptContext, characterPromptContext, storyboardPromptContext, videoPromptContext, shotLabel
} = require('../src/shared/prompt-templates');
const { createEmptyProject } = require('../src/shared/schema');

const REVISION_1_CHARACTER_SYSTEM = 'You are a character designer and casting director for short-form video production. Create distinct, production-ready identities that fit the brief. Return only one valid JSON object, without Markdown fences or commentary.';

function sampleProject() {
  const project = createEmptyProject('Demo');
  project.brief.targetDurationSec = 45; project.brief.language = 'ไทย'; project.brief.platform = 'Reels'; project.brief.keyMessage = 'หยุดคิดก่อนโอน';
  project.characters = [
    { id: 'character_may', name: 'เมย์', role: 'ตัวเอก', gender: 'หญิง', lifeStage: 'วัยทำงาน', ageYears: 30, appearance: 'หญิงไทย', wardrobe: 'เสื้อครีม', sheetStyle: '3D Cartoon', referenceImages: [{ id: 'r1', relativePath: 'characters/may.png', isPrimary: true }] },
    { id: 'character_mom', name: 'แม่อรุณ', role: 'แม่', gender: 'หญิง', lifeStage: 'ผู้สูงอายุ', ageYears: 62, referenceImages: [] }
  ];
  return project;
}
const sampleScene = () => ({ sceneNumber: 2, title: 'Discovery', purpose: 'เมย์รับสาย', location: 'ห้องนั่งเล่น', timeOfDay: 'night', mood: 'tense' });
const sampleShot = () => ({ shotNumber: 3, plannedDurationSec: 12, description: 'เมย์มองโทรศัพท์', characters: ['character_may', 'character_mom'], dialogue: [], camera: { shotSize: 'Close-up', angle: 'Eye-level', movement: 'Slow push-in', lens: '50mm' }, storyboardStyle: 'Anime / Manga', storyboardImageRelativePath: 'storyboard-images/s2-sh3.png' });
const assigned = () => [{ id: 'character_may', name: 'เมย์', referenceStyle: '3D Cartoon', primaryReference: 'characters/may.png' }, { id: 'character_mom', name: 'แม่อรุณ', referenceStyle: '3D Cartoon', primaryReference: '' }];
const segmentPlan = () => [{ segmentNumber: 1, durationSec: 8, startFrame: 'a', endFrame: 'b', actionBeat: 'beat 1' }, { segmentNumber: 2, durationSec: 4, startFrame: 'b', endFrame: 'c', actionBeat: 'beat 2' }];

test('prompt templates expose editable system and user prompts for every text task', () => {
  const templates = defaultPromptTemplates();
  assert.deepEqual(Object.keys(templates), ['story', 'characters', 'storyboard', 'video']);
  for (const template of Object.values(templates)) {
    assert.ok(template.system.length > 30);
    assert.ok(template.user.length > 30);
    assert.ok(Array.isArray(template.variables) && template.variables.length);
  }
  assert.match(templates.video.system,/image-to-video/i);
  assert.match(templates.video.system,/fictional consenting actors/i);
  assert.match(templates.video.user,/public-service awareness/i);
  assert.ok(templates.video.variables.includes('storyboardImageJson'));
  assert.ok(templates.storyboard.variables.includes('characterReferencesJson'));
});

test('every available prompt variable explains its source', () => {
  for (const template of Object.values(normalizePromptTemplates({}))) {
    for (const name of template.variables) {
      assert.ok(template.variableGuide[name]?.source, `${template.label}.${name} has no source`);
      assert.ok(template.variableGuide[name]?.description, `${template.label}.${name} has no description`);
    }
  }
});

test('prompt template rendering substitutes only declared context values', () => {
  const template = normalizePromptTemplates({ story: { system: 'System for {{projectTitle}}', user: 'Brief={{briefJson}}' } }).story;
  const rendered = renderPromptTemplate(template, { projectTitle: 'Demo', briefJson: '{"tone":"warm"}' });
  assert.equal(rendered.system, 'System for Demo');
  assert.equal(rendered.user, 'Brief={"tone":"warm"}');
});

test('prompt template validation rejects empty prompts and unknown variables', () => {
  assert.throws(() => validatePromptTemplates({ story: { system: '', user: 'valid' } }), error => error.code === 'configuration');
  assert.throws(() => validatePromptTemplates({ story: { system: 'valid', user: '{{notAvailable}}' } }), /unknown variable/);
});

test('default prompts validate, stay under the size limit and only use declared variables', () => {
  const templates = validatePromptTemplates(defaultPromptTemplates());
  for (const template of Object.values(templates)) {
    assert.ok(template.system.length < TEMPLATE_LIMIT && template.user.length < TEMPLATE_LIMIT);
    const used = new Set([...`${template.system}\n${template.user}`.matchAll(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g)].map(match => match[1]));
    for (const name of template.variables) assert.ok(used.has(name), `${template.label} never uses {{${name}}}`);
  }
});

test('default user prompts spell out the JSON contract that the app parses', () => {
  const templates = defaultPromptTemplates();
  for (const key of ['"story"', '"scenes"', '"shots"', '"plannedDurationSec"', '"characters"', '"speakerId"', '"listenerIds"', '"estimatedDurationSec"', '"startSec"', '"camera"', '"imagePrompt"', '"imageNegativePrompt"', '"storyboardStyle"']) assert.ok(templates.story.user.includes(key), `story user prompt lacks ${key}`);
  for (const key of ['"characters"', '"gender"', '"lifeStage"', '"ageYears"', '"voiceProfile"', '"visualConsistencyPrompt"', '"negativePrompt"']) assert.ok(templates.characters.user.includes(key), `characters user prompt lacks ${key}`);
  for (const key of ['"imagePrompt"', '"imageNegativePrompt"']) assert.ok(templates.storyboard.user.includes(key), `storyboard user prompt lacks ${key}`);
  for (const key of ['"segments"', '"segmentNumber"', '"videoPrompt"', '"videoNegativePrompt"', '"startFrame"', '"endFrame"', '"actionBeat"']) assert.ok(templates.video.user.includes(key), `video user prompt lacks ${key}`);
  assert.match(templates.story.user, /±10%/);
  assert.match(templates.characters.user, /หญิง, ชาย, or ไม่ระบุ/);
  assert.match(templates.storyboard.user, /attached reference image #N/);
  assert.match(templates.video.user, /4-second clip when durationSec ≤ 4/);
});

test('context builders supply every declared variable and render without leaving placeholders', () => {
  const templates = defaultPromptTemplates();
  const project = sampleProject();
  const contexts = {
    story: storyPromptContext(project),
    characters: characterPromptContext(project),
    storyboard: storyboardPromptContext(project, sampleScene(), sampleShot(), assigned(), { imagePrompt: 'draft', imageNegativePrompt: 'neg' }),
    video: videoPromptContext(project, sampleScene(), sampleShot(), assigned(), segmentPlan())
  };
  for (const [key, template] of Object.entries(templates)) {
    for (const name of template.variables) assert.ok(Object.prototype.hasOwnProperty.call(contexts[key], name), `${key} context lacks ${name}`);
    const rendered = renderPromptTemplate(template, contexts[key]);
    assert.doesNotMatch(rendered.system, /{{/); assert.doesNotMatch(rendered.user, /{{/);
  }
  assert.equal(contexts.story.targetDurationSec, '45'); assert.equal(contexts.story.language, 'ไทย'); assert.equal(contexts.story.platform, 'Reels');
  assert.equal(contexts.characters.language, 'ไทย');
  assert.equal(contexts.storyboard.shotLabel, 'S02-SH03'); assert.equal(contexts.storyboard.characterCount, '2'); assert.equal(contexts.storyboard.storyboardStyle, 'Anime / Manga');
  assert.equal(JSON.parse(contexts.storyboard.characterReferencesJson)[0].attachedAsImageInput, true);
  assert.equal(JSON.parse(contexts.storyboard.contextJson).deterministicDraft.imagePrompt, 'draft');
  assert.equal(contexts.video.segmentCount, '2'); assert.equal(contexts.video.shotDurationSec, '12'); assert.equal(contexts.video.shotLabel, 'S02-SH03');
  assert.deepEqual(JSON.parse(contexts.video.segmentPlanJson).map(segment => segment.durationSec), [8, 4]);
  assert.equal(JSON.parse(contexts.video.storyboardImageJson).attachedAsInputReference, true);
  assert.equal(shotLabel({}, {}), 'S01-SH01');
});

test('templates still equal to an earlier default are upgraded while customised text is preserved', () => {
  assert.equal(LEGACY_TEMPLATE_FINGERPRINTS.size, 8);
  assert.ok(isLegacyDefaultTemplate(REVISION_1_CHARACTER_SYSTEM));
  assert.ok(isLegacyDefaultTemplate(`${REVISION_1_CHARACTER_SYSTEM}\r\n`), 'fingerprint ignores line endings and trailing whitespace');
  assert.ok(!isLegacyDefaultTemplate(defaultPromptTemplates().characters.system), 'current default is not treated as legacy');
  assert.equal(templateFingerprint('a\r\nb '), templateFingerprint('a\nb'));
  const normalized = normalizePromptTemplates({ characters: { system: REVISION_1_CHARACTER_SYSTEM, user: 'my custom user prompt {{contextJson}}' } });
  assert.equal(normalized.characters.system, defaultPromptTemplates().characters.system);
  assert.equal(normalized.characters.user, 'my custom user prompt {{contextJson}}');
});
