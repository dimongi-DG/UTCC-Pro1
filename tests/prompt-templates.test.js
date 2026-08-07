const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultPromptTemplates, normalizePromptTemplates, validatePromptTemplates, renderPromptTemplate } = require('../src/shared/prompt-templates');

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
