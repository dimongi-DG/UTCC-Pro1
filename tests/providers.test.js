const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyProject } = require('../src/shared/schema');
const mock = require('../src/services/mock-provider');
const { classifyApiError } = require('../src/shared/api-errors');
const { normalizeGeneratedStory } = require('../src/shared/ai-normalize');

test('mock story and segment generation is usable offline', () => {
  const project=createEmptyProject('Demo');project.brief.targetDurationSec=20;project.brief.keyMessage='เริ่มจากก้าวเล็ก ๆ';
  const generated=mock.generateStory(project);assert.equal(generated.scenes.length,3);
  const shot=generated.scenes[1].shots[0];const segments=mock.buildSegments({...project,characters:[]},generated.scenes[1],shot);
  assert.equal(segments.reduce((n,x)=>n+x.durationSec,0),shot.plannedDurationSec);
  assert.ok(segments.every(x=>x.durationSec<=8&&x.videoPrompt.includes(`${x.durationSec}-second`)));
});

test('storyboard and video prompt contexts derive counts, labels and the segment plan from the shot', () => {
  const { assignedCharacterContext }=require('../src/services/provider-registry');
  const { storyboardPromptContext, videoPromptContext }=require('../src/shared/prompt-templates');
  const project=createEmptyProject('Demo');project.brief.aspectRatio='16:9';
  project.characters=[{id:'c1',name:'เมย์',sheetStyle:'3D Cartoon',referenceImages:[{id:'r1',relativePath:'characters/may.png',isPrimary:true}]},{id:'c2',name:'แม่',referenceImages:[]}];
  const scene={sceneNumber:1,title:'Scene',mood:'tense'};const shot={shotNumber:2,plannedDurationSec:20,description:'เมย์รับสาย',characters:['c1'],camera:{movement:'Slow push-in'},storyboardImageRelativePath:'storyboard-images/a.png'};
  const characters=assignedCharacterContext(project,shot);assert.equal(characters.length,1);assert.equal(characters[0].primaryReference,'characters/may.png');
  const storyboard=storyboardPromptContext(project,scene,shot,characters,mock.buildShotPrompt(project,scene,shot));
  assert.equal(storyboard.characterCount,'1');assert.equal(storyboard.shotLabel,'S01-SH02');assert.equal(storyboard.aspectRatio,'16:9');
  assert.deepEqual(JSON.parse(storyboard.characterReferencesJson).map(x=>[x.order,x.characterId,x.attachedAsImageInput]),[[1,'c1',true]]);
  const segments=mock.buildSegments(project,scene,shot);const video=videoPromptContext(project,scene,shot,characters,segments);
  assert.equal(video.segmentCount,'3');assert.equal(video.shotDurationSec,'20');
  assert.deepEqual(JSON.parse(video.segmentPlanJson).map(x=>x.durationSec),[8,8,4]);
  assert.equal(JSON.parse(video.contextJson).requiredSegments.length,3);
  assert.equal(JSON.parse(video.storyboardImageJson).relativePath,'storyboard-images/a.png');
});

test('video prompt generation requires a storyboard image for image-to-video', async () => {
  const { generateVideoSegments }=require('../src/services/provider-registry');
  await assert.rejects(generateVideoSegments(createEmptyProject('Demo'),{title:'Scene'},{plannedDurationSec:4,characters:[]}),error=>error.code==='storyboard_required');
});
test('mock AI creates suitable characters from a voice-cloning brief', () => {
  const project=createEmptyProject('เสียงคุ้นหู... ผู้แปลกหน้า');
  project.brief.concept='ลูกสาวได้รับสายเสียงแม่ที่ถูกมิจฉาชีพสร้างด้วย AI Voice Cloning เพื่อหลอกให้โอนเงิน';
  const characters=mock.generateCharacters(project);
  assert.equal(characters.length,3);
  assert.deepEqual(characters.map(character=>character.name),['เมย์','แม่อรุณ','ผู้ควบคุมเสียง']);
  assert.ok(characters.every(character=>character.id&&character.role&&character.appearance&&character.visualConsistencyPrompt&&character.negativePrompt));
  assert.ok(characters.every(character=>Array.isArray(character.referenceImages)&&character.referenceImages.length===0));
});
test('AI story normalization repairs missing shots and optional fields', () => {
  const project=createEmptyProject('Demo');
  const generated=normalizeGeneratedStory({story:{title:'Demo'},scenes:[{title:'เปิดเรื่อง',purpose:'แนะนำปัญหา',dialogue:'หยุดคิดก่อนโอน'}]},project);
  assert.equal(generated.scenes.length,1);
  assert.equal(generated.scenes[0].shots.length,1);
  assert.equal(generated.scenes[0].shots[0].dialogue[0].text,'หยุดคิดก่อนโอน');
  assert.ok(generated.scenes[0].shots[0].id);
  assert.throws(()=>normalizeGeneratedStory({story:{title:'ไม่มีฉาก'}},project),error=>error.code==='malformed_response');
});
test('AI story normalization maps character names and speakers to Character Bible IDs', () => {
  const project=createEmptyProject('Character lock');
  project.characters=[{id:'character_may',name:'เมย์',role:'ตัวเอก'}];
  const generated=normalizeGeneratedStory({story:{title:'Character lock'},scenes:[{title:'ฉาก',shots:[{description:'เมย์รับโทรศัพท์',characters:['เมย์'],dialogue:[{speakerId:'เมย์',text:'ฮัลโหล'}]}]}]},project);
  const shot=generated.scenes[0].shots[0];
  assert.deepEqual(shot.characters,['character_may']);
  assert.equal(shot.dialogue[0].speakerId,'character_may');
});
test('OpenAI Responses sends GPT-5.6 reasoning effort with structured JSON request', async () => {
  const previousFetch=global.fetch;let requestBody;
  global.fetch=async (_url,options)=>{requestBody=JSON.parse(options.body);return{ok:true,json:async()=>({output_text:'{"ok":true}'})};};
  try {
    const { generateStructuredWithVendor }=require('../src/services/provider-registry');
    const result=await generateStructuredWithVendor({protocol:'openai-responses',endpoint:'https://api.openai.com/v1/responses'},'test-key','gpt-5.6-terra','Return JSON',1000,'low');
    assert.deepEqual(result,{ok:true});
    assert.deepEqual(requestBody.reasoning,{effort:'low'});
    assert.deepEqual(requestBody.text,{format:{type:'json_object'}});
    assert.equal(requestBody.instructions,'Return only valid JSON. Do not use Markdown code fences.');
    assert.equal(requestBody.input,'Return JSON');
  } finally { global.fetch=previousFetch; }
});

test('OpenAI Responses keeps customized system and user prompts separate', async () => {
  const previousFetch=global.fetch;let requestBody;
  global.fetch=async (_url,options)=>{requestBody=JSON.parse(options.body);return{ok:true,json:async()=>({output_text:'{"ok":true}'})};};
  try {
    const { generateStructuredWithVendor }=require('../src/services/provider-registry');
    await generateStructuredWithVendor({protocol:'openai-responses',endpoint:'https://api.openai.com/v1/responses'},'test-key','gpt-5.6-terra','USER TEMPLATE',1000,'low','SYSTEM TEMPLATE');
    assert.equal(requestBody.instructions,'SYSTEM TEMPLATE');
    assert.equal(requestBody.input,'USER TEMPLATE');
  } finally { global.fetch=previousFetch; }
});
test('API errors are classified for safe retry', () => {
  assert.deepEqual(classifyApiError(401),{code:'authentication',retryable:false});
  assert.deepEqual(classifyApiError(429),{code:'rate_limit',retryable:true});
  assert.deepEqual(classifyApiError(503),{code:'provider_unavailable',retryable:true});
});

test('moderation response is classified as content policy even for HTTP 400', () => {
  assert.equal(classifyApiError(400,'Your request was blocked by our moderation system').code,'content_policy');
});
