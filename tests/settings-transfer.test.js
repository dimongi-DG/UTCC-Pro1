const test = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsBundle, parseSettingsBundle } = require('../src/shared/settings-transfer');

test('portable settings export excludes secrets and round-trips workflow routing', () => {
  const source={providers:{story:'openai',tts:'openai'},models:{story:'gpt-5.6-terra',tts:'gpt-4o-mini-tts'},reasoning:{story:'medium'},endpoints:{openaiTts:'https://api.openai.com/v1/audio/speech',openaiImageEdit:'https://api.openai.com/v1/images/edits'},promptTemplates:{story:{system:'custom system',user:'custom user'}},secrets:{openai:'encrypted-secret'},secretsConfigured:{openai:true}};
  const bundle=createSettingsBundle(source,'1.4.0');
  assert.equal(bundle.containsApiKeys,false);
  assert.equal(JSON.stringify(bundle).includes('encrypted-secret'),false);
  assert.equal(parseSettingsBundle(bundle).models.story,'gpt-5.6-terra');
  assert.equal(parseSettingsBundle(bundle).promptTemplates.story.system,'custom system');
  assert.equal(parseSettingsBundle(bundle).endpoints.openaiImageEdit,'https://api.openai.com/v1/images/edits');
});

test('settings import rejects unrelated and future-format files', () => {
  assert.throws(()=>parseSettingsBundle({format:'other',formatVersion:1,settings:{}}));
  assert.throws(()=>parseSettingsBundle({format:'clip-story-studio-settings',formatVersion:99,settings:{}}));
});
