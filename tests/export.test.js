const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createEmptyProject } = require('../src/shared/schema');
const mock = require('../src/services/mock-provider');
const { checklist, resolveAsarUnpackedPath, silentVideoArgs, storyMarkdown, storyboardMarkdown, videoPromptsMarkdown, externalStoryboardPromptMarkdown, exportExternalCharacterPrompt, exportExternalStoryboardPrompt } = require('../src/main/export-service');

test('packaged FFmpeg path resolves from app.asar to the executable in app.asar.unpacked', () => {
  const packed='C:\\Program Files\\Clip Story Studio\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe';
  const unpacked=packed.replace('app.asar','app.asar.unpacked');
  assert.equal(resolveAsarUnpackedPath(packed,value=>value===packed||value===unpacked),unpacked);
  assert.equal(resolveAsarUnpackedPath('C:\\tools\\ffmpeg.exe',value=>value==='C:\\tools\\ffmpeg.exe'),'C:\\tools\\ffmpeg.exe');
});
test('generated video post-processing maps video only and removes every audio track', () => {
  const args=silentVideoArgs('source.mp4','silent.mp4');
  assert.deepEqual(args.slice(args.indexOf('-map'),args.indexOf('-map')+2),['-map','0:v:0']);
  assert.ok(args.includes('-an'));
  assert.equal(args[args.length-1],'silent.mp4');
});

test('portable text exports use project-relative asset references', () => {
  const p=createEmptyProject('Demo');const g=mock.generateStory(p);p.story=g.story;p.scenes=g.scenes;
  const shot=p.scenes[0].shots[0];shot.storyboardImageRelativePath='storyboard-images/a.png';shot.imagePrompt='cinematic frame';shot.videoSegments=mock.buildSegments(p,p.scenes[0],shot);
  assert.match(storyMarkdown(p),/# Demo/);assert.match(storyboardMarkdown(p),/storyboard-images\/a.png/);assert.match(videoPromptsMarkdown(p),/SEG1/);
  assert.doesNotMatch(storyboardMarkdown(p),/[A-Z]:\\/);
});
test('export checklist accepts legacy AI dialogue without text', () => {
  const p=createEmptyProject('Legacy');const g=mock.generateStory(p);p.story=g.story;p.scenes=g.scenes;
  p.scenes[0].shots[0].dialogue=[{speakerId:'narrator'}];
  assert.doesNotThrow(()=>checklist('C:\\tmp',p));
  assert.match(checklist('C:\\tmp',p).warnings.join('\n'),/ไม่มีข้อความ/);
  assert.doesNotMatch(storyMarkdown(p),/undefined/);
});

test('external storyboard prompt package contains every shot and copied character references', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clip-storyboard-prompt-'));
  try {
    await fs.mkdir(path.join(root,'characters'),{recursive:true});
    await fs.writeFile(path.join(root,'characters','lead.png'),Buffer.from([1,2,3]));
    const p=createEmptyProject('External Storyboard');
    p.characters=[{id:'lead',name:'Narumol',role:'lead',gender:'หญิง',lifeStage:'วัยกลางคน',ageYears:54,appearance:'warm oval face',wardrobe:'blue cardigan',personality:'kind',sheetStyle:'3D Chibi',visualConsistencyPrompt:'preserve identity',negativePrompt:'identity drift',referenceImages:[{relativePath:'characters/lead.png',isPrimary:true}]}];
    const generated=mock.generateStory(p);p.story=generated.story;p.scenes=generated.scenes;
    p.story.opening='OPENING_MARKER';p.story.climax='CLIMAX_MARKER';p.story.ending='ENDING_MARKER';
    p.scenes[0].shots[0].characters=['lead'];p.scenes[0].shots[0].imagePrompt='cinematic storyboard frame';
    const markdown=externalStoryboardPromptMarkdown(p);
    assert.match(markdown,/SYSTEM PROMPT/);assert.match(markdown,/zero visible or readable text/i);assert.match(markdown,/Narumol/);assert.match(markdown,/S01-SH01\.png/);
    const templates={story:{system:'CUSTOM STORY SYSTEM — {{projectTitle}}',user:'CUSTOM STORY USER\nBRIEF={{briefJson}}\nCHARACTERS={{characterBibleJson}}\nMESSAGE={{keyMessage}}'}};
    const result=await exportExternalStoryboardPrompt(root,p,templates);
    assert.equal(result.shotCount,p.scenes.reduce((count,scene)=>count+scene.shots.length,0));assert.equal(result.referenceCount,1);
    assert.match(await fs.readFile(result.promptPath,'utf8'),/character-references\/character-01\.png/);
    const fullStory=await fs.readFile(result.fullStoryPromptPath,'utf8');assert.match(fullStory,/one master prompt for the complete story/i);assert.match(fullStory,/OPENING_MARKER/);assert.match(fullStory,/CLIMAX_MARKER/);assert.match(fullStory,/ENDING_MARKER/);assert.match(fullStory,/do not stop before the final Shot/i);
    const storyPair=await fs.readFile(result.storyCombinedPath,'utf8');assert.match(storyPair,/## SYSTEM PROMPT/);assert.match(storyPair,/## USER PROMPT/);assert.match(storyPair,/CUSTOM STORY SYSTEM/);assert.match(storyPair,/CUSTOM STORY USER/);
    assert.deepEqual([...await fs.readFile(path.join(result.target,'character-references','character-01.png'))],[1,2,3]);
    const json=JSON.parse(await fs.readFile(result.jsonPath,'utf8'));assert.equal(json.characters[0].referenceImage,'character-references/character-01.png');
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('external character prompt exports rendered System and User prompts from current templates', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clip-character-prompt-'));
  try {
    const p=createEmptyProject('Character Prompt Demo');p.brief.characterStyle='3D Cartoon';p.brief.concept='Family awareness story';
    const templates={characters:{system:'CUSTOM CHARACTER SYSTEM — {{projectTitle}}',user:'CUSTOM CHARACTER USER\nSTYLE={{characterStyle}}\nCONTEXT={{contextJson}}'}};
    const result=await exportExternalCharacterPrompt(root,p,templates);
    assert.equal(await fs.readFile(result.systemPath,'utf8'),'CUSTOM CHARACTER SYSTEM — Character Prompt Demo');
    const user=await fs.readFile(result.userPath,'utf8');assert.match(user,/CUSTOM CHARACTER USER/);assert.match(user,/STYLE=3D Cartoon/);assert.match(user,/Family awareness story/);
    const combined=await fs.readFile(result.combinedPath,'utf8');assert.match(combined,/## SYSTEM PROMPT/);assert.match(combined,/## USER PROMPT/);
    const json=JSON.parse(await fs.readFile(result.jsonPath,'utf8'));assert.equal(json.systemPrompt,'CUSTOM CHARACTER SYSTEM — Character Prompt Demo');assert.match(json.userPrompt,/3D Cartoon/);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
