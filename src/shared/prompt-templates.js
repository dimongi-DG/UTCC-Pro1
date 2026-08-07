const TEMPLATE_LIMIT = 30_000;

const VARIABLE_GUIDES = Object.freeze({
  story: Object.freeze({
    projectTitle: Object.freeze({ source: 'Dashboard → project.title', description: 'ชื่อโปรเจกต์ปัจจุบัน' }),
    briefJson: Object.freeze({ source: 'ขั้น 2 บรีฟ → project.brief', description: 'Concept, กลุ่มเป้าหมาย, ข้อจำกัด, mood/tone, style, platform และความยาว' }),
    characterBibleJson: Object.freeze({ source: 'ขั้น 3 ตัวละคร → project.characters', description: 'ID, เพศ, ช่วงวัย, อายุ, บุคลิก, วิธีพูด, รูปลักษณ์ และภาพอ้างอิงของตัวละครที่อนุญาต' }),
    keyMessage: Object.freeze({ source: 'ขั้น 2 บรีฟ → project.brief.keyMessage', description: 'สารหลักที่เรื่องต้องรักษาไว้' })
  }),
  characters: Object.freeze({
    projectTitle: Object.freeze({ source: 'Dashboard → project.title', description: 'ชื่อโปรเจกต์ปัจจุบัน' }),
    characterStyle: Object.freeze({ source: 'ขั้น 2 บรีฟ → project.brief.characterStyle', description: 'รูปแบบภาพเริ่มต้น เช่น 3D Cartoon, Chibi หรือสไตล์ที่ผู้ใช้พิมพ์เอง' }),
    contextJson: Object.freeze({ source: 'Dashboard + บรีฟ + ตัวละครเดิม', description: 'ข้อมูลตั้งต้นสำหรับออกแบบตัวละครโดยไม่สร้างชื่อหรือบทบาทซ้ำ' })
  }),
  storyboard: Object.freeze({
    projectTitle: Object.freeze({ source: 'Dashboard → project.title', description: 'ชื่อโปรเจกต์ปัจจุบัน' }),
    storyboardStyle: Object.freeze({ source: 'Shot หรือ บรีฟ → storyboardStyle', description: 'รูปแบบภาพ Storyboard ที่เลือกสำหรับ Shot นี้' }),
    aspectRatio: Object.freeze({ source: 'ขั้น 2 บรีฟ → project.brief.aspectRatio', description: 'สัดส่วนภาพของโปรเจกต์' }),
    characterReferencesJson: Object.freeze({ source: 'ขั้น 3 ตัวละคร + shot.characters', description: 'Metadata และลำดับภาพ Character Sheet ที่จะถูกแนบจริงผ่าน Images Edit API' }),
    contextJson: Object.freeze({ source: 'บรีฟ + เรื่องราว + Scene/Shot + ตัวละครที่ถูก assign', description: 'เนื้อหา ฉาก กล้อง แสง เหตุการณ์ และ continuity ของ Shot' })
  }),
  video: Object.freeze({
    projectTitle: Object.freeze({ source: 'Dashboard → project.title', description: 'ชื่อโปรเจกต์ปัจจุบัน' }),
    segmentCount: Object.freeze({ source: 'shot.plannedDurationSec ÷ สูงสุด 8 วินาที', description: 'จำนวน Segment ที่ระบบคำนวณอัตโนมัติ' }),
    aspectRatio: Object.freeze({ source: 'ขั้น 2 บรีฟ → project.brief.aspectRatio', description: 'สัดส่วนวิดีโอปลายทาง' }),
    storyboardImageJson: Object.freeze({ source: 'ขั้น 5 Storyboard → shot.storyboardImageRelativePath', description: 'Metadata ของภาพ Storyboard ซึ่งจะถูกแนบจริงเป็น input_reference ตอนสร้างวิดีโอ' }),
    contextJson: Object.freeze({ source: 'เรื่องราว + Scene/Shot + ตัวละคร + action beats', description: 'การเคลื่อนไหว กล้อง แสง และจุดต่อเนื่องของแต่ละ Segment' })
  })
});

const DEFAULT_PROMPT_TEMPLATES = Object.freeze({
  story: Object.freeze({
    label: 'Story generation',
    description: 'สร้าง Story, Scene, Shot, Dialogue และภาพร่างเชิงคำสั่งจาก Brief โดยล็อก Character Bible',
    variables: Object.freeze(['briefJson', 'characterBibleJson', 'keyMessage', 'projectTitle']),
    system: 'You are a senior short-form video writer, director, and continuity editor. Follow the brief and Character Bible exactly. Return only one valid JSON object, without Markdown fences or commentary. Never invent, rename, merge, or redesign a named character. Every imagePrompt must explicitly require a completely text-free visual with no letters, words, numbers, logos, labels, captions, subtitles, watermarks, signs, documents, messages, or readable screens in any language.',
    user: `Create a production-ready short-form video story for {{projectTitle}}.

Return this exact top-level JSON shape:
{"story":{"title":"","hook":"","logline":"","synopsis":"","opening":"","climax":"","ending":"","callToAction":""},"scenes":[{"title":"","purpose":"","location":"","timeOfDay":"","settingDescription":"","atmosphere":"","mood":"","tone":"","narrativeBeat":"","emotionalArc":"","shots":[{"description":"","purpose":"","plannedDurationSec":5,"characters":["character_id"],"dialogue":[{"speakerId":"character_id_or_narrator","listenerIds":["character_id"],"text":"","emotion":"neutral","delivery":"natural","pace":1}],"camera":{"shotSize":"Medium shot","angle":"Eye-level","movement":"Static","lens":"35mm"},"action":"","environment":"","lighting":"","storyboardStyle":"","imagePrompt":"English draft prompt for this exact shot","imageNegativePrompt":"English negative prompt"}]}]}.

scenes must be a non-empty array and every scene must contain a non-empty shots array. Cover the opening, escalation, climax, ending and call to action. Describe where and when each scene occurs, atmosphere, mood, tone, camera, lighting and visible action. Every dialogue line must identify who speaks, who listens, the exact words, emotion, delivery and pace. Use ONLY characters from CHARACTER_BIBLE. Every shots[].characters entry, listenerIds entry and non-narrator speakerId must use an exact CHARACTER_BIBLE id. Preserve gender, life stage, age, appearance, wardrobe, personality, speaking style, reference style and visual identity. imagePrompt is a draft shot sketch instruction and must mention assigned character IDs/names; actual Character Sheet files will be attached later when the Storyboard image is rendered. Every imagePrompt must end with an absolute requirement that the generated frame contain zero visible text, letters, words, numbers, captions, subtitles, labels, logos, watermarks, signs, messages, documents, or readable screen content in any language. Use the brief language. Preserve this key message: {{keyMessage}}

CHARACTER_BIBLE:
{{characterBibleJson}}

BRIEF:
{{briefJson}}`
  }),
  characters: Object.freeze({
    label: 'Character design',
    description: 'สร้าง Character Bible จาก Brief พร้อมเพศ ช่วงวัย อายุ บุคลิก และข้อมูลเสียง',
    variables: Object.freeze(['contextJson', 'characterStyle', 'projectTitle']),
    system: 'You are a character designer and casting director for short-form video production. Create distinct, production-ready identities that fit the brief. Return only one valid JSON object, without Markdown fences or commentary.',
    user: `Design 2-5 visually distinct characters for {{projectTitle}} in this required style: {{characterStyle}}. Do not duplicate an existing character.

Return strict JSON:
{"characters":[{"name":"","role":"","gender":"หญิง|ชาย|ไม่ระบุ","lifeStage":"เด็ก|วัยรุ่น|วัยทำงาน|วัยกลางคน|ผู้สูงอายุ","ageYears":30,"ageRange":"","appearance":"","wardrobe":"","personality":"","speakingStyle":"","voiceProfile":{"genderPresentation":"","ageImpression":"","tone":"","pace":"","accent":""},"visualConsistencyPrompt":"English prompt for stable identity and the required style","negativePrompt":"English negative prompt"}]}.

Infer every character from the brief: gender, child/adult/elderly life stage, plausible exact age, role, temperament, behaviour and voice. The story and brief may be Thai. Keep name, role, personality, speakingStyle and voiceProfile in that language, but write visual prompts in English. The visualConsistencyPrompt must explicitly preserve {{characterStyle}} and must not drift into photorealism when the requested style is 3D, cartoon, chibi, shibi, illustration, or another stylized medium.

CONTEXT:
{{contextJson}}`
  }),
  storyboard: Object.freeze({
    label: 'Storyboard prompt',
    description: 'สร้าง Image prompt ราย Shot จากเรื่องราวและ Character Sheet ที่จะถูกแนบจริง',
    variables: Object.freeze(['contextJson', 'characterReferencesJson', 'storyboardStyle', 'aspectRatio', 'projectTitle']),
    system: 'You are a storyboard artist and visual continuity supervisor. Preserve exact identity from the attached Character Sheet images, wardrobe, visual medium, spatial continuity, camera, lighting, and safety constraints. The image must be completely text-free: no letters, words, numbers, captions, subtitles, labels, logos, watermarks, signs, documents, messages, or readable screens in any language. Return only one valid JSON object, without Markdown fences or commentary.',
    user: `Create one production-ready NEW storyboard scene image prompt for {{projectTitle}} in {{storyboardStyle}} at {{aspectRatio}}.

Return strict JSON:
{"imagePrompt":"English visual prompt with exact assigned subjects, composition, action, camera, lighting, environment, visual medium and aspect ratio","imageNegativePrompt":"English negative prompt"}.

The Character Sheet images listed below will be attached as real image inputs to the Images Edit API in the same order. Treat them as identity and style references only. Compose a new story scene; do not reproduce a turnaround sheet, collage, labels, or multiple views. Do not change gender, apparent age, face, hairstyle, body proportions, wardrobe or requested visual medium. The final image must contain absolutely no visible text or typography of any kind. Keep every screen, sign, document, package and clothing graphic blank, abstract, fully blurred, turned away, or outside the frame.

CHARACTER REFERENCES:
{{characterReferencesJson}}

STORY AND SHOT CONTEXT:
{{contextJson}}`
  }),
  video: Object.freeze({
    label: 'Image-to-video segment prompt',
    description: 'สร้างคำสั่งการเคลื่อนไหว 1–8 วินาที โดยใช้ภาพ Storyboard เป็นเฟรมอ้างอิงบังคับ',
    variables: Object.freeze(['contextJson', 'storyboardImageJson', 'segmentCount', 'aspectRatio', 'projectTitle']),
    system: 'You are an image-to-video motion director and safety-aware continuity supervisor. The attached Storyboard image is the mandatory visual source frame. Animate it without redesigning identity, wardrobe, medium, composition, spatial layout, lighting, or camera unless the shot explicitly requests camera motion. Every video frame must remain completely text-free: no letters, words, numbers, captions, subtitles, title cards, labels, logos, watermarks, signs, documents, messages, interface text, or readable screens in any language. Treat all people as fictional consenting actors and never request a real-person likeness, public figure, copied voice, impersonation, fraud instructions, personal data, banking data, credentials, or operational wrongdoing. Return only one valid JSON object, without Markdown fences or commentary.',
    user: `Write one production-ready image-to-video motion prompt for every required segment of {{projectTitle}} at {{aspectRatio}}.

Return strict JSON:
{"segments":[{"segmentNumber":1,"videoPrompt":"English image-to-video motion instruction","videoNegativePrompt":"English negative prompt","startFrame":"","endFrame":"","actionBeat":""}]}.

Return exactly {{segmentCount}} segments in the same order and never change duration. The Storyboard image below is not optional: it will be attached to the Video API as input_reference. Describe only the intended movement, performance, camera motion and continuity from that image; do not re-describe or redesign a new still image. Frame sensitive stories as fictional public-service awareness dramatizations that emphasize recognition, verification, prevention and emotional consequences. Do not depict how to conduct a scam, imitate a named person, operate synthetic-media tools, transfer funds, enter credentials, or evade detection. Every videoPrompt must explicitly require zero visible text in every frame; every device, sign, document, package, clothing graphic and interface must be blank, abstract, fully blurred, turned away, or outside the frame. Segment 2 onward must continue from the exact ending state of the previous segment.

STORYBOARD IMAGE:
{{storyboardImageJson}}

CONTEXT:
{{contextJson}}`
  })
});

const clone = value => JSON.parse(JSON.stringify(value));

function defaultPromptTemplates() { return clone(DEFAULT_PROMPT_TEMPLATES); }

function normalizePromptTemplates(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const [key, defaults] of Object.entries(DEFAULT_PROMPT_TEMPLATES)) {
    const candidate = source[key] && typeof source[key] === 'object' ? source[key] : {};
    normalized[key] = {
      label: defaults.label,
      description: defaults.description,
      variables: [...defaults.variables],
      variableGuide: clone(VARIABLE_GUIDES[key] || {}),
      system: typeof candidate.system === 'string' ? candidate.system : defaults.system,
      user: typeof candidate.user === 'string' ? candidate.user : defaults.user
    };
  }
  return normalized;
}

function validatePromptTemplates(value) {
  const templates = normalizePromptTemplates(value);
  for (const template of Object.values(templates)) {
    for (const part of ['system', 'user']) {
      const text = template[part].trim();
      if (!text) throw Object.assign(new Error(`${template.label}: ${part} prompt must not be empty`), { code: 'configuration' });
      if (text.length > TEMPLATE_LIMIT) throw Object.assign(new Error(`${template.label}: ${part} prompt is longer than ${TEMPLATE_LIMIT.toLocaleString()} characters`), { code: 'configuration' });
      const unknown = [...text.matchAll(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g)].map(match => match[1]).filter(name => !template.variables.includes(name));
      if (unknown.length) throw Object.assign(new Error(`${template.label}: unknown variable {{${unknown[0]}}}`), { code: 'configuration' });
    }
  }
  return templates;
}

function renderPromptTemplate(template, context = {}) {
  const render = text => text.replace(/{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(context, name)) throw Object.assign(new Error(`Prompt template is missing value for {{${name}}}`), { code: 'configuration' });
    return String(context[name] ?? '');
  });
  return { system: render(template.system), user: render(template.user) };
}

function storyPromptContext(project = {}) {
  const characterBible = (project.characters || []).map(character => ({
    id: character.id, name: character.name, role: character.role, gender: character.gender, lifeStage: character.lifeStage,
    ageYears: character.ageYears, ageRange: character.ageRange, appearance: character.appearance, wardrobe: character.wardrobe,
    personality: character.personality, speakingStyle: character.speakingStyle, voiceProfile: character.voiceProfile,
    visualConsistencyPrompt: character.visualConsistencyPrompt, referenceStyle: character.sheetStyle || 'Cinematic Realism',
    primaryReference: character.referenceImages?.find(image => image.isPrimary)?.relativePath || character.referenceImages?.[0]?.relativePath || ''
  }));
  return {
    projectTitle: project.title || '',
    keyMessage: project.brief?.keyMessage || '',
    characterBibleJson: JSON.stringify(characterBible, null, 2),
    briefJson: JSON.stringify(project.brief || {}, null, 2)
  };
}

function characterPromptContext(project = {}) {
  const context = {
    title: project.title,
    brief: project.brief,
    story: project.story,
    scenes: (project.scenes || []).map(scene => ({ title: scene.title, purpose: scene.purpose, shots: (scene.shots || []).map(shot => shot.description) })),
    existingCharacters: (project.characters || []).map(character => ({ name: character.name, role: character.role }))
  };
  return {
    projectTitle: project.title || '',
    characterStyle: project.brief?.characterStyle || 'Cinematic Realism',
    contextJson: JSON.stringify(context, null, 2)
  };
}

module.exports = { DEFAULT_PROMPT_TEMPLATES, VARIABLE_GUIDES, TEMPLATE_LIMIT, defaultPromptTemplates, normalizePromptTemplates, validatePromptTemplates, renderPromptTemplate, storyPromptContext, characterPromptContext };
