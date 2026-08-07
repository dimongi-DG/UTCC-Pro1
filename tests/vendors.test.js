const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_VENDORS, normalizeVendors, validateEndpoint, validateVendors } = require('../src/shared/vendors');
const { DEFAULT_SETTINGS } = require('../src/shared/constants');

test('vendor presets include OpenRouter and Qwen OpenAI-compatible endpoints', () => {
  const vendors=normalizeVendors();
  assert.equal(vendors.find(v=>v.id==='openrouter').endpoint,'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(vendors.find(v=>v.id==='openrouter').modelsEndpoint,'https://openrouter.ai/api/v1/key');
  assert.equal(vendors.find(v=>v.id==='openai').defaultModel,'gpt-5.6-terra');
  assert.equal(vendors.find(v=>v.id==='qwen').protocol,'openai-chat');
  assert.match(vendors.find(v=>v.id==='qwen').endpoint,/dashscope-intl\.aliyuncs\.com/);
});
test('custom vendor validation accepts HTTPS and localhost only', () => {
  const custom={id:'my_vendor',name:'My Vendor',protocol:'openai-chat',endpoint:'https://ai.example.com/v1/chat/completions',modelsEndpoint:'',defaultModel:'model-1',capabilities:['text'],supportsJsonMode:false};
  assert.equal(validateVendors([...DEFAULT_VENDORS,custom]).at(-1).id,'my_vendor');
  assert.throws(()=>validateEndpoint('http://ai.example.com/v1'));
  assert.equal(validateEndpoint('http://localhost:11434/v1/chat/completions'),'http://localhost:11434/v1/chat/completions');
  assert.throws(()=>validateEndpoint('https://user:secret@ai.example.com/v1'));
});
test('AI request timeout defaults to two minutes', () => {
  assert.equal(DEFAULT_SETTINGS.requestTimeoutSec,120);
});
