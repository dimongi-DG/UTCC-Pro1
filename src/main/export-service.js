const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { flattenShots, flattenSegments, flattenDialogue } = require('../shared/schema');
const { csvCell } = require('../shared/utils');
const { normalizePromptTemplates, renderPromptTemplate, storyPromptContext, characterPromptContext } = require('../shared/prompt-templates');
const { assertRelativePath, safeNumber } = require('./validators');
const { ZipWriter } = require('./zip-writer');
const { buildStoryboardPdf } = require('./pdf-writer');

let electron;
try {
  electron = require('electron');
} catch { /* empty */ }

function loadNativeImage(fullPath) {
  if (electron && electron.nativeImage && fs.existsSync(fullPath)) {
    const image = electron.nativeImage.fromFile(fullPath);
    if (!image.isEmpty()) {
      const rgba = image.getBitmap();
      const { width, height } = image.getSize();
      return { rgba, width, height };
    }
  }
  return null;
}

let running = null;
function assetExists(root, relative) { return relative && fs.existsSync(path.join(root, ...relative.split('/'))); }
function checklist(root, project) {
  const warnings = [], errors = [];
  for (const { scene, shot } of flattenShots(project)) {
    const label = `Scene ${scene.sceneNumber} / Shot ${shot.shotNumber}`;
    if (!shot.storyboardImageRelativePath) warnings.push(`${label}: ยังไม่มีภาพ Storyboard`);
    if (!shot.videoSegments?.length) warnings.push(`${label}: ยังไม่มี Video Segment`);
    for (const segment of shot.videoSegments || []) {
      if (segment.durationSec > 8 || segment.durationSec <= 0) errors.push(`${label}: Segment ต้องยาว 1–8 วินาที`);
      if (!segment.videoClipRelativePath) warnings.push(`${label} / Segment ${segment.segmentNumber}: ยังไม่มีวิดีโอ`);
      else if (!assetExists(root, segment.videoClipRelativePath)) errors.push(`${label}: อ่านไฟล์วิดีโอไม่ได้`);
    }
    const capacity = (shot.videoSegments || []).reduce((sum, s) => sum + Number(s.durationSec || 0), 0) || shot.plannedDurationSec;
    for (const line of shot.dialogue || []) {
      const dialogueText = String(line?.text || line?.dialogue || '').trim();
      if (!line?.audioRelativePath) warnings.push(`${label}: ยังไม่มีเสียง “${dialogueText.slice(0, 30) || 'ไม่มีข้อความ'}”`);
      if (Number(line.estimatedDurationSec) > capacity) warnings.push(`${label}: บทพูดยาวเกินภาพประมาณ ${(line.estimatedDurationSec - capacity).toFixed(1)} วินาที`);
    }
  }
  return { warnings: [...new Set(warnings)], errors: [...new Set(errors)] };
}
function storyMarkdown(project) {
  const lines = [`# ${project.story.title || project.title}`, '', `> ${project.story.logline || ''}`, '', project.story.synopsis || '', '', `**Hook:** ${project.story.hook || ''}`, ''];
  for (const scene of project.scenes || []) {
    lines.push(`## Scene ${scene.sceneNumber}: ${scene.title}`, '', scene.purpose || '', '');
    for (const shot of scene.shots || []) {
      lines.push(`### Shot ${shot.shotNumber} — ${shot.plannedDurationSec}s`, '', shot.description || '', '');
      for (const line of shot.dialogue || []) lines.push(`- **${line?.speakerId || 'narrator'}:** ${line?.text || line?.dialogue || ''}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
function storyboardMarkdown(project) {
  const rows = [`# Storyboard — ${project.title}`, ''];
  for (const { scene, shot } of flattenShots(project)) rows.push(`## S${scene.sceneNumber} · SH${shot.shotNumber} · ${shot.plannedDurationSec}s`, '', shot.imagePrompt || '', '', `Negative: ${shot.imageNegativePrompt || ''}`, '', `Image: ${shot.storyboardImageRelativePath || '—'}`, '');
  return rows.join('\n');
}
function videoPromptsMarkdown(project) {
  return flattenSegments(project).map(({ scene, shot, segment }) => `## S${scene.sceneNumber} · SH${shot.shotNumber} · SEG${segment.segmentNumber} · ${segment.durationSec}s\n\n${segment.videoPrompt}\n\nNegative: ${segment.videoNegativePrompt}`).join('\n\n');
}
function renderedGenerationPrompts(project, promptTemplates, key) {
  const templates = normalizePromptTemplates(promptTemplates);
  const context = key === 'characters' ? characterPromptContext(project) : storyPromptContext(project);
  return renderPromptTemplate(templates[key], context);
}
function systemUserPromptMarkdown(title, prompts) {
  return [`# ${title}`, '', '## SYSTEM PROMPT', '', prompts.system, '', '## USER PROMPT', '', prompts.user, ''].join('\n');
}
async function exportExternalCharacterPrompt(root, project, promptTemplates) {
  const target = path.join(root, 'exports', `external-character-prompt-${Date.now()}`);
  await fsp.mkdir(target, { recursive: true });
  const prompts = renderedGenerationPrompts(project, promptTemplates, 'characters');
  const systemPath = path.join(target, 'character-system-prompt.md');
  const userPath = path.join(target, 'character-user-prompt.md');
  const combinedPath = path.join(target, 'character-system-and-user-prompt.md');
  const jsonPath = path.join(target, 'character-generation-prompt.json');
  await Promise.all([
    fsp.writeFile(systemPath, prompts.system, 'utf8'),
    fsp.writeFile(userPath, prompts.user, 'utf8'),
    fsp.writeFile(combinedPath, systemUserPromptMarkdown('Character Generation Prompt', prompts), 'utf8'),
    fsp.writeFile(jsonPath, JSON.stringify({ schemaVersion: 1, task: 'character-generation', systemPrompt: prompts.system, userPrompt: prompts.user }, null, 2), 'utf8')
  ]);
  return { target, systemPath, userPath, combinedPath, jsonPath };
}
function storyboardReferenceManifest(project) {
  return (project.characters || []).map((character, index) => {
    const reference = (character.referenceImages || []).find(image => image.isPrimary) || character.referenceImages?.[0];
    const extension = ['.png','.jpg','.jpeg','.webp'].includes(path.extname(reference?.relativePath || '').toLowerCase()) ? path.extname(reference.relativePath).toLowerCase() : '.png';
    return {
      characterId: character.id,
      characterName: character.name,
      sourceRelativePath: reference?.relativePath || '',
      exportedReferencePath: reference?.relativePath ? `character-references/character-${String(index + 1).padStart(2, '0')}${extension}` : '',
      available: Boolean(reference?.relativePath)
    };
  });
}
function externalStoryboardData(project, references = storyboardReferenceManifest(project)) {
  const referenceByCharacter = new Map(references.map(reference => [reference.characterId, reference]));
  const characterById = new Map((project.characters || []).map(character => [character.id, character]));
  const characters = (project.characters || []).map(character => ({
    id: character.id,
    name: character.name,
    role: character.role,
    gender: character.gender,
    lifeStage: character.lifeStage,
    ageYears: character.ageYears,
    appearance: character.appearance,
    wardrobe: character.wardrobe,
    personality: character.personality,
    visualStyle: character.sheetStyle || project.brief?.characterStyle || '',
    visualConsistencyPrompt: character.visualConsistencyPrompt || '',
    negativePrompt: character.negativePrompt || '',
    referenceImage: referenceByCharacter.get(character.id)?.exportedReferencePath || ''
  }));
  const shots = flattenShots(project).map(({ scene, shot }) => ({
    id: `S${String(scene.sceneNumber).padStart(2, '0')}-SH${String(shot.shotNumber).padStart(2, '0')}`,
    outputFilename: `S${String(scene.sceneNumber).padStart(2, '0')}-SH${String(shot.shotNumber).padStart(2, '0')}.png`,
    scene: {
      number: scene.sceneNumber,
      title: scene.title,
      purpose: scene.purpose,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      settingDescription: scene.settingDescription,
      atmosphere: scene.atmosphere,
      mood: scene.mood,
      tone: scene.tone,
      narrativeBeat: scene.narrativeBeat,
      emotionalArc: scene.emotionalArc
    },
    shot: {
      number: shot.shotNumber,
      durationSec: shot.plannedDurationSec,
      description: shot.description,
      action: shot.action,
      camera: shot.camera || {},
      storyboardStyle: shot.storyboardStyle || project.brief?.storyboardStyle || 'Cinematic Color',
      characterIds: shot.characters || [],
      characters: (shot.characters || []).map(id => {
        const character = characterById.get(id);
        return character ? { id, name: character.name, referenceImage: referenceByCharacter.get(id)?.exportedReferencePath || '' } : { id, name: id, referenceImage: '' };
      }),
      dialogue: (shot.dialogue || []).map(line => ({
        speakerId: line.speakerId,
        speakerName: characterById.get(line.speakerId)?.name || line.speakerId,
        listenerIds: line.listenerIds || [],
        text: line.text || line.dialogue || '',
        emotion: line.emotion || '',
        delivery: line.delivery || ''
      })),
      imagePrompt: shot.imagePrompt || '',
      negativePrompt: shot.imageNegativePrompt || ''
    }
  }));
  return {
    schemaVersion: 1,
    purpose: 'Generate one consistent, text-free storyboard image for every shot using the supplied story and character references.',
    project: {
      title: project.title,
      storyTitle: project.story?.title || project.title,
      concept: project.brief?.concept || '',
      hook: project.story?.hook || '',
      logline: project.story?.logline || '',
      synopsis: project.story?.synopsis || '',
      opening: project.story?.opening || '',
      climax: project.story?.climax || '',
      ending: project.story?.ending || '',
      keyMessage: project.brief?.keyMessage || '',
      targetAudience: project.brief?.targetAudience || '',
      callToAction: project.brief?.callToAction || '',
      genre: project.brief?.genre || '',
      tone: project.brief?.tone || '',
      visualStyle: project.brief?.visualStyle || '',
      storyboardStyle: project.brief?.storyboardStyle || 'Cinematic Color',
      aspectRatio: project.brief?.aspectRatio || '9:16',
      language: project.brief?.language || 'ไทย',
      constraints: project.brief?.constraints || ''
    },
    characters,
    shots
  };
}
function externalStoryboardPromptMarkdown(project, references = storyboardReferenceManifest(project)) {
  const data = externalStoryboardData(project, references);
  const lines = [
    `# External AI Storyboard Prompt — ${data.project.storyTitle}`,
    '',
    '## SYSTEM PROMPT',
    '',
    `You are a professional storyboard artist. Generate exactly ${data.shots.length} separate storyboard images, one independent image for each shot below, in the listed order. Use aspect ratio ${data.project.aspectRatio} and the requested visual medium. Preserve the identity, apparent age, body proportions, hairstyle, wardrobe, and visual style of every recurring character by using the attached Character Sheet files as image references. Compose a new scene rather than reproducing a turnaround sheet or contact sheet. Keep camera, setting, lighting, mood, action, eyelines, and continuity faithful to the supplied shot.`,
    '',
    '**HIGHEST-PRIORITY TEXT-FREE RULE:** Every generated image must contain zero visible or readable text in any language. Do not render captions, subtitles, speech bubbles, title cards, letters, words, numbers, labels, logos, brand marks, watermarks, credits, typography, interface text, messages, signs, posters, documents, package text, or writing-like symbols. Any phone, computer, television, document, package, clothing graphic, or sign must be blank, abstract, fully blurred, turned away, or outside the frame.',
    '',
    'Return or save one image per shot using the requested filename. Do not combine multiple shots into one grid. Do not add annotations, borders, shot numbers, captions, or labels inside the images.',
    '',
    '## USER PROMPT',
    '',
    '## PROJECT CONTEXT',
    '',
    `- Title: ${data.project.storyTitle}`,
    `- Hook: ${data.project.hook}`,
    `- Logline: ${data.project.logline}`,
    `- Synopsis: ${data.project.synopsis}`,
    `- Opening: ${data.project.opening}`,
    `- Climax: ${data.project.climax}`,
    `- Ending: ${data.project.ending}`,
    `- Key message: ${data.project.keyMessage}`,
    `- Genre: ${data.project.genre}`,
    `- Tone: ${data.project.tone}`,
    `- Global visual style: ${data.project.visualStyle}`,
    `- Storyboard style: ${data.project.storyboardStyle}`,
    `- Aspect ratio: ${data.project.aspectRatio}`,
    `- Constraints: ${data.project.constraints}`,
    '',
    '## CHARACTER BIBLE AND REFERENCE FILES',
    ''
  ];
  for (const character of data.characters) {
    lines.push(`### ${character.name} (${character.id})`, '',
      `- Reference image to attach: ${character.referenceImage || 'ไม่มีไฟล์อ้างอิง — ใช้คำบรรยายเท่านั้น'}`,
      `- Role / gender / age: ${[character.role,character.gender,character.lifeStage,character.ageYears ? `${character.ageYears} years old` : ''].filter(Boolean).join(' · ')}`,
      `- Appearance: ${character.appearance}`,
      `- Wardrobe: ${character.wardrobe}`,
      `- Personality: ${character.personality}`,
      `- Visual medium: ${character.visualStyle}`,
      `- Identity lock: ${character.visualConsistencyPrompt}`,
      `- Avoid: ${character.negativePrompt}`, '');
  }
  lines.push('## SHOT PROMPTS', '');
  for (const entry of data.shots) {
    const { scene, shot } = entry;
    lines.push(`### ${entry.id} — output ${entry.outputFilename}`, '',
      `- Scene: ${scene.title}`,
      `- Story purpose: ${scene.purpose}`,
      `- Location / time: ${scene.location} · ${scene.timeOfDay}`,
      `- Setting: ${scene.settingDescription}`,
      `- Atmosphere / mood / tone: ${scene.atmosphere} · ${scene.mood} · ${scene.tone}`,
      `- Narrative beat / emotional arc: ${scene.narrativeBeat} · ${scene.emotionalArc}`,
      `- Duration: ${shot.durationSec}s`,
      `- Description: ${shot.description}`,
      `- Action: ${shot.action}`,
      `- Camera: ${JSON.stringify(shot.camera)}`,
      `- Storyboard style: ${shot.storyboardStyle}`,
      `- Characters and attached references: ${shot.characters.map(character => `${character.name}${character.referenceImage ? ` [${character.referenceImage}]` : ''}`).join(', ') || 'ไม่มีตัวละคร'}`,
      `- Dialogue/performance context: ${shot.dialogue.map(line => `${line.speakerName} → ${(line.listenerIds || []).join(', ') || 'scene'}: “${line.text}” (${line.emotion}; ${line.delivery})`).join(' | ') || 'ไม่มีบทพูด'}`,
      '',
      '**IMAGE PROMPT**', '', shot.imagePrompt || `Create a ${shot.storyboardStyle} storyboard frame for this shot using every detail above.`, '',
      '**NEGATIVE PROMPT**', '', `${shot.negativePrompt || 'identity drift, changed wardrobe, duplicate character, incorrect age, incorrect gender, collage, contact sheet'}; visible text, letters, words, numbers, subtitles, speech bubbles, labels, logos, watermarks, typography`, '');
  }
  lines.push('## MACHINE-READABLE DATA', '', 'The companion file `storyboard-ai-prompt.json` contains the same project, character, scene, shot, dialogue, camera, prompt, and reference mappings as structured JSON.');
  return lines.join('\n');
}
function fullStoryMasterPromptMarkdown(project, references = storyboardReferenceManifest(project)) {
  const data = externalStoryboardData(project, references);
  const lines = [
    `# Full Story Master Prompt — ${data.project.storyTitle}`,
    '',
    'Copy this entire document into the external AI together with every file in `character-references/`. This is one master prompt for the complete story, not an isolated single-scene request.',
    '',
    '## SYSTEM PROMPT',
    '',
    '### MASTER INSTRUCTION',
    '',
    `Read and understand the complete story from beginning to end before generating anything. Treat all ${data.shots.length} shots as one continuous narrative with a single emotional arc, consistent characters, locations, lighting logic, wardrobe, props, screen direction, and visual medium. Create a complete professional storyboard set for the whole story. Do not reinterpret each Scene or Shot in isolation and do not omit, merge, reorder, or invent story events.`,
    '',
    `Generate exactly ${data.shots.length} separate images in story order, using aspect ratio ${data.project.aspectRatio}. Use the supplied Character Sheet files as image references for identity and style. One output image represents one Shot; never combine outputs into a contact sheet or multi-panel grid.`,
    '',
    '**HIGHEST-PRIORITY TEXT-FREE RULE:** Every image must contain zero visible or readable text in any language. No captions, subtitles, speech bubbles, title cards, letters, words, numbers, labels, logos, brand marks, watermarks, credits, typography, interface text, messages, signs, posters, documents, package text, or writing-like symbols. Keep every device screen, sign, document, package, and clothing graphic blank, abstract, fully blurred, turned away, or outside the frame.',
    '',
    '## USER PROMPT',
    '',
    '## COMPLETE STORY BRIEF',
    '',
    `- Project: ${data.project.title}`,
    `- Story title: ${data.project.storyTitle}`,
    `- Concept: ${data.project.concept}`,
    `- Hook: ${data.project.hook}`,
    `- Logline: ${data.project.logline}`,
    `- Full synopsis: ${data.project.synopsis}`,
    `- Opening: ${data.project.opening}`,
    `- Climax: ${data.project.climax}`,
    `- Ending: ${data.project.ending}`,
    `- Key message: ${data.project.keyMessage}`,
    `- Target audience: ${data.project.targetAudience}`,
    `- Call to action: ${data.project.callToAction}`,
    `- Genre: ${data.project.genre}`,
    `- Overall tone and emotional progression: ${data.project.tone}`,
    `- Global visual style and camera language: ${data.project.visualStyle}`,
    `- Storyboard medium: ${data.project.storyboardStyle}`,
    `- Aspect ratio: ${data.project.aspectRatio}`,
    `- Language context: ${data.project.language}`,
    `- Constraints: ${data.project.constraints}`,
    '',
    '## COMPLETE CHARACTER BIBLE',
    ''
  ];
  for (const character of data.characters) {
    lines.push(`- **${character.name} (${character.id})** — ${[character.role,character.gender,character.lifeStage,character.ageYears ? `${character.ageYears} years old` : ''].filter(Boolean).join(' · ')}. Appearance: ${character.appearance}. Wardrobe: ${character.wardrobe}. Personality: ${character.personality}. Visual medium: ${character.visualStyle}. Identity lock: ${character.visualConsistencyPrompt}. Avoid: ${character.negativePrompt}. Attach reference: ${character.referenceImage || 'none available'}`);
  }
  lines.push('', '## FULL ORDERED STORY — ALL EVENTS, PERFORMANCES, AND CAMERA BEATS', '');
  let currentScene = null;
  for (const entry of data.shots) {
    const { scene, shot } = entry;
    if (currentScene !== scene.number) {
      currentScene = scene.number;
      lines.push(`### Scene ${scene.number}: ${scene.title}`, '',
        `Story purpose: ${scene.purpose}. Location and time: ${scene.location}, ${scene.timeOfDay}. Setting: ${scene.settingDescription}. Atmosphere: ${scene.atmosphere}. Mood and tone: ${scene.mood}; ${scene.tone}. Narrative beat: ${scene.narrativeBeat}. Emotional arc: ${scene.emotionalArc}.`, '');
    }
    lines.push(`**${entry.id} — ${shot.durationSec}s — output ${entry.outputFilename}**`, '',
      `The story shows: ${shot.description}. Action and performance: ${shot.action}. Camera direction: ${JSON.stringify(shot.camera)}. Characters present: ${shot.characters.map(character => character.name).join(', ') || 'none'}.`,
      shot.dialogue.length ? `Dialogue and acting context: ${shot.dialogue.map(line => `${line.speakerName} says to ${(line.listenerIds || []).join(', ') || 'the scene'}: “${line.text}” with ${line.emotion} emotion and ${line.delivery} delivery`).join(' Then ')}` : 'There is no spoken dialogue in this shot.',
      `Canonical image direction: ${shot.imagePrompt || `Create a ${shot.storyboardStyle} storyboard frame faithful to this complete-story beat.`}`,
      `Avoid in this shot: ${shot.negativePrompt || 'identity drift, changed wardrobe, duplicate character, incorrect age, incorrect gender, collage, contact sheet'}, plus all visible text and typography.`, '');
  }
  lines.push('## REQUIRED COMPLETE-STORY DELIVERABLE', '',
    `Produce the complete set of ${data.shots.length} storyboard images in the exact order above. Preserve cause-and-effect, emotional escalation, character identity, wardrobe, props, spatial relationships, eyelines, light progression, camera language, and ending payoff across the entire story. Name outputs exactly as specified for each Shot. Do not return only one Scene and do not stop before the final Shot.`, '',
    'If the external tool cannot generate all images in one operation, retain this full master prompt as persistent context and generate the requested files sequentially without changing any established visual facts.');
  return lines.join('\n');
}
async function exportExternalStoryboardPrompt(root, project, promptTemplates) {
  const target = path.join(root, 'exports', `external-storyboard-prompt-${Date.now()}`);
  const referenceTarget = path.join(target, 'character-references');
  await fsp.mkdir(referenceTarget, { recursive: true });
  const references = storyboardReferenceManifest(project);
  for (const reference of references) {
    if (!reference.sourceRelativePath) { reference.available = false; reference.exportedReferencePath = ''; continue; }
    assertRelativePath(reference.sourceRelativePath);
    const source = path.join(root, ...reference.sourceRelativePath.split('/'));
    if (!fs.existsSync(source)) { reference.available = false; reference.exportedReferencePath = ''; continue; }
    await fsp.copyFile(source, path.join(target, ...reference.exportedReferencePath.split('/')));
    reference.available = true;
  }
  const data = externalStoryboardData(project, references);
  const storyGenerationPrompts = renderedGenerationPrompts(project, promptTemplates, 'story');
  const fullStoryPromptPath = path.join(target, 'full-story-master-prompt.md');
  const promptPath = path.join(target, 'storyboard-ai-prompt.md');
  const storySystemPath = path.join(target, 'story-system-prompt.md');
  const storyUserPath = path.join(target, 'story-user-prompt.md');
  const storyCombinedPath = path.join(target, 'story-system-and-user-prompt.md');
  const jsonPath = path.join(target, 'storyboard-ai-prompt.json');
  await Promise.all([
    fsp.writeFile(fullStoryPromptPath, fullStoryMasterPromptMarkdown(project, references), 'utf8'),
    fsp.writeFile(promptPath, externalStoryboardPromptMarkdown(project, references), 'utf8'),
    fsp.writeFile(storySystemPath, storyGenerationPrompts.system, 'utf8'),
    fsp.writeFile(storyUserPath, storyGenerationPrompts.user, 'utf8'),
    fsp.writeFile(storyCombinedPath, systemUserPromptMarkdown('Story Generation Prompt', storyGenerationPrompts), 'utf8'),
    fsp.writeFile(jsonPath, JSON.stringify({ ...data, generationPrompts: { story: { systemPrompt: storyGenerationPrompts.system, userPrompt: storyGenerationPrompts.user } } }, null, 2), 'utf8')
  ]);
  return { target, fullStoryPromptPath, promptPath, storySystemPath, storyUserPath, storyCombinedPath, jsonPath, shotCount: data.shots.length, referenceCount: references.filter(reference => reference.available).length };
}
async function exportPackage(root, project) {
  const target = path.join(root, 'exports', `package-${Date.now()}`);
  await fsp.mkdir(target, { recursive: true });
  await Promise.all([
    fsp.writeFile(path.join(target, 'project.json'), JSON.stringify(project, null, 2)),
    fsp.writeFile(path.join(target, 'story.md'), storyMarkdown(project)),
    fsp.writeFile(path.join(target, 'storyboard.md'), storyboardMarkdown(project)),
    fsp.writeFile(path.join(target, 'storyboard.json'), JSON.stringify(flattenShots(project), null, 2)),
    fsp.writeFile(path.join(target, 'video-prompts.md'), videoPromptsMarkdown(project)),
    fsp.writeFile(path.join(target, 'image-prompts.txt'), flattenShots(project).map(({ scene, shot }) => `S${scene.sceneNumber}-SH${shot.shotNumber}\n${shot.imagePrompt}\nNEGATIVE: ${shot.imageNegativePrompt}`).join('\n\n')),
    fsp.writeFile(path.join(target, 'storyboard.csv'), ['scene,shot,duration,image_prompt,negative_prompt,image', ...flattenShots(project).map(({ scene, shot }) => [scene.sceneNumber, shot.shotNumber, shot.plannedDurationSec, shot.imagePrompt, shot.imageNegativePrompt, shot.storyboardImageRelativePath].map(csvCell).join(','))].join('\n')),
    fsp.writeFile(path.join(target, 'dialogue.csv'), ['scene,shot,speaker,text,emotion,duration,audio_file', ...flattenDialogue(project).map(({ scene, shot, dialogue }) => [scene.sceneNumber, shot.shotNumber, dialogue.speakerId, dialogue.text, dialogue.emotion, dialogue.estimatedDurationSec, dialogue.audioRelativePath].map(csvCell).join(','))].join('\n'))
  ]);
  return { target };
}
function dimensions(preset) {
  const map = { '1080x1920': [1080, 1920], '1920x1080': [1920, 1080], '1080x1080': [1080, 1080] };
  return map[preset] || map['1080x1920'];
}
function resolveAsarUnpackedPath(candidate, exists = fs.existsSync) {
  const value = String(candidate || '');
  if (!value) return value;
  const unpacked = value.replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2');
  if (unpacked !== value && exists(unpacked)) return unpacked;
  return value;
}
function resolveFfmpeg(customPath) {
  if (customPath) return resolveAsarUnpackedPath(customPath);
  try { return resolveAsarUnpackedPath(require('ffmpeg-static')); } catch { return 'ffmpeg'; }
}
function silentVideoArgs(inputPath, outputPath) {
  return ['-y', '-i', inputPath, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', outputPath];
}
function stripAudioTrack(inputPath, outputPath, customPath = '') {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpeg(customPath);
    const child = spawn(ffmpegPath, silentVideoArgs(inputPath, outputPath), { windowsHide: true });
    let stderr = '', settled = false;
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
    child.on('error', error => {
      if (settled) return; settled = true;
      reject(Object.assign(new Error(`FFmpeg could not remove the generated video audio: ${error.message}`), { code: 'ffmpeg_unavailable', details: { ffmpegPath } }));
    });
    child.on('close', code => {
      if (settled) return; settled = true;
      if (code === 0) resolve({ outputPath, audioRemoved: true });
      else reject(Object.assign(new Error(`FFmpeg could not remove the generated video audio (exit ${code}): ${stderr.slice(-600)}`), { code: 'ffmpeg_error', details: { ffmpegPath, exitCode: code } }));
    });
  });
}
async function stripProjectVideoAudio(root, relativePath, customPath = '') {
  assertRelativePath(relativePath);
  const inputPath = path.join(root, ...String(relativePath).split('/'));
  if (!fs.existsSync(inputPath)) throw Object.assign(new Error('Video file was not found in this project'), { code: 'configuration' });
  const extension = path.extname(inputPath) || '.mp4';
  const stem = inputPath.slice(0, -extension.length);
  const stamp = Date.now();
  const backupPath = `${stem}.audio-backup-${stamp}${extension}`;
  const outputPath = `${stem}.silent-temp-${stamp}${extension}`;
  await fsp.rename(inputPath, backupPath);
  try {
    await stripAudioTrack(backupPath, outputPath, customPath);
    await fsp.rename(outputPath, inputPath);
    await fsp.rm(backupPath, { force: true });
    return { relativePath, audioRemoved: true };
  } catch (error) {
    await fsp.rm(outputPath, { force: true });
    if (!fs.existsSync(inputPath) && fs.existsSync(backupPath)) await fsp.rename(backupPath, inputPath);
    throw error;
  }
}
function testFfmpeg(customPath = '') {
  return new Promise(resolve => {
    const child = spawn(resolveFfmpeg(customPath), ['-version'], { windowsHide: true });
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.on('error', error => resolve({ ok: false, message: error.message }));
    child.on('close', code => resolve({ ok: code === 0, message: code === 0 ? output.split('\n')[0] : `FFmpeg exited ${code}` }));
  });
}
async function exportMp4(root, project, outputPath, options, onProgress) {
  if (running) throw new Error('An export is already running');
  const clips = flattenSegments(project).filter(({ segment }) => segment.videoClipRelativePath);
  if (!clips.length) throw new Error('Import at least one video clip before MP4 export');
  const [width, height] = dimensions(options.preset);
  const args = ['-y'];
  for (const { segment } of clips) {
    assertRelativePath(segment.videoClipRelativePath);
    args.push('-i', path.join(root, ...segment.videoClipRelativePath.split('/')));
  }
  const audioEntries = [];
  let shotOffset = 0;
  for (const { shot } of flattenShots(project)) {
    for (const dialogue of shot.dialogue || []) {
      if (assetExists(root, dialogue.audioRelativePath)) {
        assertRelativePath(dialogue.audioRelativePath);
        audioEntries.push({ relativePath: dialogue.audioRelativePath, startSec: shotOffset + Number(dialogue.startSec || 0), volume: 1, loop: false });
      }
    }
    shotOffset += (shot.videoSegments || []).reduce((sum, segment) => sum + Number(segment.durationSec || 0), 0) || Number(shot.plannedDurationSec || 0);
  }
  if (assetExists(root, project.timeline?.musicRelativePath)) {
    assertRelativePath(project.timeline.musicRelativePath);
    audioEntries.push({ relativePath: project.timeline.musicRelativePath, startSec: 0, volume: safeNumber(project.timeline.musicVolume, 0, 2, .25), loop: true });
  }
  for (const effect of project.timeline?.sfx || []) {
    if (!assetExists(root, effect.relativePath)) continue;
    assertRelativePath(effect.relativePath);
    audioEntries.push({ relativePath: effect.relativePath, startSec: safeNumber(effect.startSec, 0, 86400, 0), volume: safeNumber(effect.volume, 0, 2, 1), loop: false });
  }
  for (const entry of audioEntries) {
    if (entry.loop) args.push('-stream_loop', '-1');
    args.push('-i', path.join(root, ...entry.relativePath.split('/')));
  }
  const filters = clips.map(({ segment }, i) => {
    const duration = safeNumber(segment.durationSec, 0.1, 8, 1);
    const fit = options.fitMode === 'contain'
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    return `[${i}:v]trim=start=${safeNumber(segment.trimStartSec, 0, 3600, 0)}:duration=${duration},setpts=PTS-STARTPTS,${fit},fps=30,format=yuv420p[v${i}]`;
  });
  filters.push(`${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[vout]`);
  const total = clips.reduce((sum, x) => sum + Number(x.segment.durationSec), 0);
  if (audioEntries.length) {
    audioEntries.forEach((entry, index) => {
      const inputIndex = clips.length + index;
      const delayMs = Math.max(0, Math.round(entry.startSec * 1000));
      filters.push(`[${inputIndex}:a]adelay=${delayMs}:all=1,volume=${entry.volume}[a${index}]`);
    });
    filters.push(`${audioEntries.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioEntries.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${total},aresample=48000[aout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]');
  } else {
    args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', `${clips.length}:a`);
  }
  args.push('-t', String(total), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath);
  return new Promise((resolve, reject) => {
    const child = spawn(resolveFfmpeg(options.ffmpegPath), args, { windowsHide: true });
    running = child; let stderr = '';
    child.stderr.on('data', data => {
      const chunk = data.toString(); stderr = (stderr + chunk).slice(-8000);
      const match = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) onProgress(Math.min(99, ((+match[1] * 3600 + +match[2] * 60 + +match[3]) / total) * 100));
    });
    child.on('error', error => { running = null; reject(error); });
    child.on('close', code => { running = null; if (code === 0) { onProgress(100); resolve({ outputPath }); } else reject(new Error(`FFmpeg export failed (${code}): ${stderr.slice(-600)}`)); });
  });
}
async function exportStoryboardPdf(root, project, outputPath) {
  const imageLoader = (relativePath) => {
    assertRelativePath(relativePath);
    return loadNativeImage(path.join(root, ...String(relativePath).split('/')));
  };
  const pdf = buildStoryboardPdf(project, { includeImages: true, imageLoader });
  await fsp.writeFile(outputPath, pdf);
  return { outputPath, pageCount: Math.ceil(flattenShots(project).length / 3) };
}

async function exportZipPackage(root, project) {
  const target = path.join(root, 'exports', `package-${Date.now()}.zip`);
  const zip = new ZipWriter();

  const collect = async (dir) => {
    const entries = await fsp.readdir(path.join(root, dir), { withFileTypes: true });
    for (const entry of entries) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collect(rel);
      } else {
        const data = await fsp.readFile(path.join(root, rel));
        zip.addBuffer(rel.replace(/^exports\//, ''), data);
      }
    }
  };

  const exportsDir = path.join(root, 'exports');

  await exportPackage(root, project);

  const exportDirs = (await fsp.readdir(exportsDir, { withFileTypes: true })).filter(d => d.isDirectory() && d.name.startsWith('package-'));
  for (const dir of exportDirs) {
    const dirRel = path.posix.join('exports', dir.name);
    await collect(dirRel);
  }

  zip.addBuffer('project.json', await fsp.readFile(path.join(root, 'project.json')));

  const buffer = zip.build();
  await fsp.writeFile(target, buffer);
  return { outputPath: target };
}

function cancelExport() { if (running) { running.kill(); running = null; return true; } return false; }
module.exports = { checklist, exportPackage, exportExternalCharacterPrompt, exportExternalStoryboardPrompt, exportMp4, cancelExport, testFfmpeg, resolveAsarUnpackedPath, resolveFfmpeg, silentVideoArgs, stripAudioTrack, stripProjectVideoAudio, storyMarkdown, storyboardMarkdown, videoPromptsMarkdown, storyboardReferenceManifest, externalStoryboardData, externalStoryboardPromptMarkdown, fullStoryMasterPromptMarkdown, renderedGenerationPrompts, systemUserPromptMarkdown, exportStoryboardPdf, exportZipPackage };
