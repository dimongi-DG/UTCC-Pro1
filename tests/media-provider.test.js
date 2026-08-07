const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { sizeForImage, sizeForVideo, secondsForVideo, characterSheetPrompt, characterStyleDirective, storyboardStylePrompt, collectCharacterReferences, requestImageEdit, safetyFrameVideoPrompt, responseError } = require('../src/services/media-provider');
const { enforceNoVisibleTextPrompt, enforceNoVisibleTextNegative } = require('../src/prompts/prompt-builder');

test('image and video prompts enforce zero visible text in every generated frame', () => {
  const image=enforceNoVisibleTextPrompt('A person holding a phone','image');
  const video=enforceNoVisibleTextPrompt('Slow push-in','video');
  assert.match(image,/zero visible or readable text in any language/i);
  assert.match(video,/Every frame of the video.*zero visible or readable text/is);
  assert.match(enforceNoVisibleTextNegative('identity drift'),/readable screens/i);
  assert.equal(enforceNoVisibleTextPrompt(image,'image'),image);
});

test('media generation maps project ratios and segment durations to supported API values', () => {
  assert.equal(sizeForImage('9:16'),'1024x1536');
  assert.equal(sizeForImage('16:9'),'1536x1024');
  assert.equal(sizeForVideo('9:16'),'720x1280');
  assert.equal(secondsForVideo(3),'4');
  assert.equal(secondsForVideo(7),'8');
});

test('storyboard style defaults to color and keeps monochrome optional', () => {
  assert.equal(storyboardStylePrompt().style,'Cinematic Color');
  assert.match(storyboardStylePrompt('Photorealistic').directive,/photorealistic/i);
  assert.match(storyboardStylePrompt('Black-and-white Ink').directive,/no color/i);
});

test('character sheet prompt preserves style and requests four consistent views', () => {
  const result=characterSheetPrompt({name:'เมย์',sheetStyle:'Anime / Manga',appearance:'Thai woman',wardrobe:'cream office shirt'});
  assert.equal(result.style,'Anime / Manga');
  for(const view of ['front view','three-quarter front view','strict side profile','back view'])assert.match(result.prompt,new RegExp(view));
  assert.match(result.prompt,/Same person, identical face/);
});

test('3D character style is locked against photorealistic identity wording', () => {
  const result=characterSheetPrompt({name:'แม่อรุณ',sheetStyle:'3D Character Concept',appearance:'realistic skin and cinematic lighting'});
  assert.equal(result.style,'3D Character Concept');
  assert.match(result.prompt,/unmistakably CGI/i);
  assert.match(result.prompt,/NOT photorealistic/i);
  assert.match(result.prompt,/STYLE LOCK — HIGHEST PRIORITY/);
});

test('custom character styles are preserved instead of falling back to realism', () => {
  const custom='Pastel shibi vinyl-toy render';
  const result=characterSheetPrompt({name:'เมย์',sheetStyle:custom});
  assert.equal(result.style,custom);
  assert.match(result.prompt,/Pastel shibi vinyl-toy render/);
  assert.equal(characterStyleDirective('3D Cartoon').photographic,false);
});

test('storyboard references include only assigned characters and prefer primary sheets', () => {
  const project={brief:{characterStyle:'3D Chibi'},characters:[
    {id:'a',name:'A',sheetStyle:'3D Chibi',referenceImages:[{relativePath:'characters/a-old.png'},{relativePath:'characters/a-primary.png',isPrimary:true}]},
    {id:'b',name:'B',referenceImages:[{relativePath:'characters/b.png'}]}
  ]};
  assert.deepEqual(collectCharacterReferences(project,{characters:['a']}),[{characterId:'a',name:'A',style:'3D Chibi',relativePath:'characters/a-primary.png'}]);
});

test('reference-based storyboard request sends Character Sheets as multipart image inputs', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clip-story-media-'));
  await fs.mkdir(path.join(root,'characters'));
  await fs.writeFile(path.join(root,'characters','a.png'),Buffer.from('89504e470d0a1a0a','hex'));
  const originalFetch=global.fetch;
  let captured;
  global.fetch=async (_url,options)=>{captured=options;return{ok:true,json:async()=>({data:[{b64_json:Buffer.from('result').toString('base64')}]})};};
  try {
    const result=await requestImageEdit({endpoints:{openaiImageEdit:'https://api.openai.com/v1/images/edits'},requestTimeoutSec:60},'secret',root,{model:'gpt-image-2',prompt:'new scene'},[{characterId:'a',name:'A',relativePath:'characters/a.png'}],'test');
    assert.equal(result.toString(),'result');
    assert.equal(captured.headers.authorization,'Bearer secret');
    assert.equal(captured.body.getAll('image[]').length,1);
    assert.equal(captured.body.get('model'),'gpt-image-2');
  } finally { global.fetch=originalFetch; await fs.rm(root,{recursive:true,force:true}); }
});

test('Sora safety framing removes operational scam language and declares fictional adults', () => {
  const project={characters:[{id:'adult',ageYears:54,lifeStage:'วัยกลางคน'}]};
  const prompt=safetyFrameVideoPrompt('A deepfake voice cloning scammer asks for a bank transfer and OTP.',project,{characters:['adult']});
  assert.match(prompt,/PUBLIC-SERVICE SAFETY DRAMATIZATION/);
  assert.match(prompt,/fictional adult actors aged 25 or older/);
  assert.doesNotMatch(prompt,/deepfake|voice cloning|scammer|bank transfer|OTP/i);
  assert.match(prompt,/awareness.*prevention/i);
});

test('Strict Sora rewrite replaces an already framed blocked prompt with a prevention-only vignette', () => {
  const project={characters:[{id:'adult',ageYears:54}]};
  const standard=safetyFrameVideoPrompt('A deepfake scam asks for OTP.',project,{characters:['adult']});
  const strict=safetyFrameVideoPrompt(standard,project,{characters:['adult']},{strict:true});
  assert.match(strict,/STRICT PUBLIC-SERVICE PREVENTION VIGNETTE/);
  assert.match(strict,/fictional adult actors aged 25 or older/);
  assert.doesNotMatch(strict,/deepfake|scam|OTP/i);
  assert.notEqual(strict,standard);
});

test('Video API HTTP 400 moderation body is preserved and classified', async () => {
  const response=new Response(JSON.stringify({error:{message:'Your request was blocked by our moderation system.'}}),{
    status:400,
    headers:{'content-type':'application/json'}
  });
  const error=await responseError(response,'OpenAI video generation');
  assert.equal(error.code,'content_policy');
  assert.equal(error.details.httpStatus,400);
  assert.match(error.message,/moderation system/i);
});
