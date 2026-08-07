const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cacheKey, speechInstructions, resolveOpenAIVoice, estimateDuration, createWav, synthesizeOpenAI } = require('../src/services/tts-provider');

test('TTS cache key changes with text, voice or settings', () => {
  const a=cacheKey('hello','a',{rate:1});assert.equal(a,cacheKey('hello','a',{rate:1}));
  assert.notEqual(a,cacheKey('hello!','a',{rate:1}));assert.notEqual(a,cacheKey('hello','b',{rate:1}));
});

test('TTS instructions include character personality and delivery', () => {
  const instructions=speechInstructions({emotion:'กังวล',delivery:'สั่นเครือ',characterProfile:{gender:'หญิง',lifeStage:'ผู้สูงอายุ',ageYears:62,personality:'อ่อนโยน',speakingStyle:'นุ่มนวล',voiceProfile:{tone:'อบอุ่น'}}});
  assert.match(instructions,/อ่อนโยน/);
  assert.match(instructions,/สั่นเครือ/);
  assert.match(instructions,/62/);
});
test('Thai female alias resolves to coral with native Thai feminine direction', () => {
  assert.equal(resolveOpenAIVoice('th-female-warm'),'coral');
  const instructions=speechInstructions({voiceId:'th-female-warm',language:'th-TH',characterProfile:{gender:'หญิง',ageYears:54}});
  assert.match(instructions,/native Thai/i);
  assert.match(instructions,/clearly feminine/i);
  assert.match(instructions,/never masculine or androgynous/i);
});
test('mock TTS emits valid WAV and estimates positive duration', () => {
  assert.equal(createWav(1).subarray(0,4).toString(),'RIFF');assert.ok(estimateDuration('ทดสอบข้อความ','th-TH',1)>0);
});
test('OpenAI TTS writes binary response inside the portable project', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clip-tts-'));await fs.mkdir(path.join(root,'voices'));
  const originalFetch=global.fetch;let request;
  global.fetch=async (_url,options)=>{request=JSON.parse(options.body);return {ok:true,arrayBuffer:async()=>Uint8Array.from([1,2,3]).buffer};};
  try {
    const result=await synthesizeOpenAI(root,{dialogueId:'line1',text:'hello',voiceId:'coral',language:'en-US',rate:1,emotion:'warm'},{models:{tts:'gpt-4o-mini-tts'},endpoints:{}},'secret');
    assert.equal(request.voice,'coral');assert.equal(request.instructions.includes('warm'),true);
    assert.deepEqual([...await fs.readFile(path.join(root,...result.relativePath.split('/')))],[1,2,3]);
  } finally { global.fetch=originalFetch;await fs.rm(root,{recursive:true,force:true}); }
});

test('OpenAI TTS forceRegenerate bypasses an existing cached audio file', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clip-tts-force-'));await fs.mkdir(path.join(root,'voices'));
  const originalFetch=global.fetch;let calls=0;
  global.fetch=async()=>{calls+=1;return {ok:true,arrayBuffer:async()=>Uint8Array.from([calls]).buffer};};
  try {
    const payload={dialogueId:'line-force',text:'ทดสอบเสียงใหม่',voiceId:'nova',language:'th-TH',rate:1,emotion:'neutral'};
    const settings={models:{tts:'gpt-4o-mini-tts'},endpoints:{}};
    const first=await synthesizeOpenAI(root,payload,settings,'secret');
    const cached=await synthesizeOpenAI(root,payload,settings,'secret');
    const regenerated=await synthesizeOpenAI(root,{...payload,forceRegenerate:true},settings,'secret');
    assert.equal(first.cached,false);assert.equal(cached.cached,true);assert.equal(regenerated.cached,false);
    assert.equal(calls,2);assert.equal(regenerated.requestedVoice,'nova');assert.equal(regenerated.providerVoice,'nova');
    assert.deepEqual([...await fs.readFile(path.join(root,...regenerated.relativePath.split('/')))],[2]);
  } finally { global.fetch=originalFetch;await fs.rm(root,{recursive:true,force:true}); }
});
