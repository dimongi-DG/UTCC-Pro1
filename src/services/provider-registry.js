const mock = require('./mock-provider');
const { getSettings, getSecret } = require('../main/settings-store');
const { classifyApiError } = require('../shared/api-errors');
const { vendorFor, validateEndpoint } = require('../shared/vendors');
const { id } = require('../shared/utils');
const { normalizeGeneratedStory } = require('../shared/ai-normalize');
const { normalizePromptTemplates, renderPromptTemplate, storyPromptContext, characterPromptContext } = require('../shared/prompt-templates');
const { enforceNoVisibleTextPrompt, enforceNoVisibleTextNegative } = require('../prompts/prompt-builder');

function promptsFor(settings, key, context) {
  const template = normalizePromptTemplates(settings.promptTemplates)[key];
  return renderPromptTemplate(template, context);
}
function assignedCharacterContext(project, shot) {
  const ids = new Set(Array.isArray(shot?.characters) ? shot.characters : []);
  return (project.characters || []).filter(character => ids.has(character.id)).map(character => {
    const primary = character.referenceImages?.find(image => image.isPrimary) || character.referenceImages?.[0];
    return {
      id: character.id, name: character.name, role: character.role, gender: character.gender, lifeStage: character.lifeStage,
      ageYears: character.ageYears, ageRange: character.ageRange, appearance: character.appearance, wardrobe: character.wardrobe,
      personality: character.personality, speakingStyle: character.speakingStyle, voiceProfile: character.voiceProfile,
      visualConsistencyPrompt: character.visualConsistencyPrompt, referenceStyle: character.sheetStyle || project.brief?.characterStyle || '',
      primaryReference: primary?.relativePath || '', referenceSource: primary?.source || ''
    };
  });
}
async function requestJson(url, options, retries = 1, timeoutMs = 120_000) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (error) {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 400 * 2 ** attempt)); continue; }
      const timedOut = error?.name === 'TimeoutError' || /timeout|aborted/i.test(error?.message || '');
      throw Object.assign(new Error(timedOut ? 'AI request timed out' : 'Network offline or provider is unreachable'), { code: timedOut ? 'timeout' : 'network', retryable: true });
    }
    if (response.ok) return response.json();
    const kind = classifyApiError(response.status);
    if (kind.retryable && attempt < retries) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); continue; }
    throw Object.assign(new Error(`Provider request failed (${response.status})`), kind);
  }
}
async function generateStory(project) {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const incomplete = characters.filter(character => !character.referenceImages?.length);
  if (!characters.length || incomplete.length) {
    throw Object.assign(new Error(!characters.length ? 'Create characters before generating the story' : `Add a Character Sheet or reference image for: ${incomplete.map(character => character.name).join(', ')}`), { code: 'character_required' });
  }
  const settings = await getSettings();
  const providerId = settings.providers.story || 'mock';
  if (providerId === 'mock') return normalizeGeneratedStory(mock.generateStory(project), project);
  const vendor = vendorFor(settings, providerId);
  if (!vendor) throw new Error(`Unknown AI vendor: ${providerId}`);
  const key = await getSecret(providerId);
  if (!key) throw Object.assign(new Error(`No API key saved for ${vendor.name}`), { code: 'authentication' });
  const configuredModel = settings.models.story || '';
  const model = configuredModel.startsWith('mock-') ? vendor.defaultModel : configuredModel;
  const prompts = promptsFor(settings, 'story', storyPromptContext(project));
  const timeoutMs = Math.min(300, Math.max(30, Number(settings.requestTimeoutSec) || 120)) * 1000;
  const generated = await generateStructuredWithVendor(vendor, key, model, prompts.user, timeoutMs, settings.reasoning?.story, prompts.system);
  return normalizeGeneratedStory(generated, project);
}
async function generateStructuredWithVendor(vendor, key, model, userPrompt, timeoutMs, reasoningEffort = '', systemPrompt = 'Return only valid JSON. Do not use Markdown code fences.') {
  if (vendor.protocol === 'openai-responses') {
    const body = { model, instructions: systemPrompt, input: userPrompt, text: { format: { type: 'json_object' } } };
    if (/^gpt-5\.6(?:-|$)/.test(model) && ['none','low','medium','high','xhigh','max'].includes(reasoningEffort)) body.reasoning = { effort: reasoningEffort };
    const data = await requestJson(validateEndpoint(vendor.endpoint), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, 1, timeoutMs);
    const text = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
    return parseStructured(text);
  }
  if (vendor.protocol === 'gemini') {
    const endpoint = `${validateEndpoint(vendor.endpoint)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const data = await requestJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: userPrompt }] }], generationConfig: { responseMimeType: 'application/json' } }) }, 1, timeoutMs);
    return parseStructured(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
  }
  if (vendor.protocol === 'openai-chat') {
    const body = { model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7 };
    if (vendor.supportsJsonMode) body.response_format = { type: 'json_object' };
    const data = await requestJson(validateEndpoint(vendor.endpoint), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) }, 1, timeoutMs);
    return parseStructured(data.choices?.[0]?.message?.content || '');
  }
  throw Object.assign(new Error(`${vendor.name} does not support text generation`), { code: 'unsupported_capability' });
}
async function generateCharacters(project) {
  const settings = await getSettings();
  const providerId = settings.providers.story || 'mock';
  if (providerId === 'mock') return mock.generateCharacters(project);
  const vendor = vendorFor(settings, providerId);
  if (!vendor) throw new Error(`Unknown AI vendor: ${providerId}`);
  const key = await getSecret(providerId);
  if (!key) throw Object.assign(new Error(`No API key saved for ${vendor.name}`), { code: 'authentication' });
  const configuredModel = settings.models.story || '';
  const model = configuredModel.startsWith('mock-') ? vendor.defaultModel : configuredModel;
  const prompts = promptsFor(settings, 'characters', characterPromptContext(project));
  const timeoutMs = Math.min(300, Math.max(30, Number(settings.requestTimeoutSec) || 120)) * 1000;
  const generated = await generateStructuredWithVendor(vendor, key, model, prompts.user, timeoutMs, settings.reasoning?.story, prompts.system);
  const list = Array.isArray(generated) ? generated : generated?.characters;
  if (!Array.isArray(list) || !list.length) throw Object.assign(new Error('AI did not return any characters'), { code: 'malformed_response' });
  const existing = new Set((project.characters || []).map(character => character.name.trim().toLowerCase()));
  const clean = value => String(value || '').trim().slice(0, 2000);
  return list.slice(0, 8).filter(character => character && !existing.has(clean(character.name).toLowerCase())).map(character => ({
    id: id('character'), name: clean(character.name) || 'ตัวละครใหม่', role: clean(character.role), gender: clean(character.gender),
    lifeStage: clean(character.lifeStage), ageYears: Math.max(0, Math.min(120, Number(character.ageYears) || Number(clean(character.ageRange).match(/\d+/)?.[0]) || 0)), ageRange: clean(character.ageRange),
    appearance: clean(character.appearance), wardrobe: clean(character.wardrobe), personality: clean(character.personality), speakingStyle: clean(character.speakingStyle),
    voiceProfile: {
      genderPresentation: clean(character.voiceProfile?.genderPresentation), ageImpression: clean(character.voiceProfile?.ageImpression),
      tone: clean(character.voiceProfile?.tone), pace: clean(character.voiceProfile?.pace), accent: clean(character.voiceProfile?.accent)
    },
    visualConsistencyPrompt: clean(character.visualConsistencyPrompt), negativePrompt: clean(character.negativePrompt), sheetStyle: clean(project.brief?.characterStyle) || 'Cinematic Realism', referenceImages: [], voiceId: ''
  }));
}
async function generationRoute(capability) {
  const settings = await getSettings();
  const providerId = settings.providers?.[capability] || 'mock';
  if (providerId === 'mock') return { mock: true, settings };
  const vendor = vendorFor(settings, providerId);
  if (!vendor) throw new Error(`Unknown AI vendor: ${providerId}`);
  const key = await getSecret(providerId);
  if (!key) throw Object.assign(new Error(`No API key saved for ${vendor.name}`), { code: 'authentication' });
  const configuredModel = settings.models?.[capability] || '';
  const model = configuredModel.startsWith('mock-') ? vendor.defaultModel : configuredModel;
  if (!model) throw Object.assign(new Error(`No model configured for ${capability}`), { code: 'configuration' });
  const timeoutMs = Math.min(300, Math.max(30, Number(settings.requestTimeoutSec) || 120)) * 1000;
  return { mock: false, settings, vendor, key, model, timeoutMs, reasoningEffort: settings.reasoning?.[capability] };
}
async function generateShotPrompt(project, scene, shot) {
  const route = await generationRoute('storyboard');
  const base = mock.buildShotPrompt(project, scene, shot);
  if (route.mock) return { ...base, promptGenerationMeta: { provider: 'mock', model: 'mock-visual-v1', generatedAt: new Date().toISOString() } };
  const assignedCharacters = assignedCharacterContext(project, shot);
  const context = {
    brief: project.brief, story: project.story,
    characters: assignedCharacters,
    scene: { title: scene.title, purpose: scene.purpose, location: scene.location, timeOfDay: scene.timeOfDay, settingDescription: scene.settingDescription, atmosphere: scene.atmosphere, mood: scene.mood, tone: scene.tone, narrativeBeat: scene.narrativeBeat, emotionalArc: scene.emotionalArc },
    shot: { description: shot.description, purpose: shot.purpose, characters: shot.characters, dialogue: shot.dialogue, camera: shot.camera, action: shot.action, environment: shot.environment, lighting: shot.lighting },
    deterministicDraft: base
  };
  const prompts = promptsFor(route.settings, 'storyboard', {
    projectTitle: project.title || '', storyboardStyle: shot.storyboardStyle || project.brief?.storyboardStyle || 'Cinematic Color',
    aspectRatio: project.brief?.aspectRatio || '9:16', characterReferencesJson: JSON.stringify(assignedCharacters.map((character, index) => ({ order: index + 1, characterId: character.id, name: character.name, style: character.referenceStyle, relativePath: character.primaryReference, attachedAsImageInput: Boolean(character.primaryReference) })), null, 2), contextJson: JSON.stringify(context, null, 2)
  });
  const generated = await generateStructuredWithVendor(route.vendor, route.key, route.model, prompts.user, route.timeoutMs, route.reasoningEffort, prompts.system);
  const imagePrompt = String(generated?.imagePrompt || '').trim();
  if (!imagePrompt) throw Object.assign(new Error('AI did not return an imagePrompt'), { code: 'malformed_response' });
  return { imagePrompt: enforceNoVisibleTextPrompt(imagePrompt, 'image'), imageNegativePrompt: enforceNoVisibleTextNegative(String(generated?.imageNegativePrompt || base.imageNegativePrompt || '').trim()), promptGenerationMeta: { provider: route.vendor.id, model: route.model, generatedAt: new Date().toISOString() } };
}
async function generateVideoSegments(project, scene, shot) {
  if (!String(shot?.storyboardImageRelativePath || '').trim()) throw Object.assign(new Error('Create the Storyboard image before generating image-to-video segments'), { code: 'storyboard_required' });
  const base = mock.buildSegments(project, scene, shot);
  const route = await generationRoute('video');
  if (route.mock) return base.map(segment => ({ ...segment, generationMode: 'image-to-video', sourceStoryboardRelativePath: shot.storyboardImageRelativePath }));
  const assignedCharacters = assignedCharacterContext(project, shot);
  const context = {
    brief: project.brief,
    characters: assignedCharacters,
    scene: { title: scene.title, purpose: scene.purpose, location: scene.location, timeOfDay: scene.timeOfDay, atmosphere: scene.atmosphere, mood: scene.mood, tone: scene.tone },
    shot: { description: shot.description, dialogue: shot.dialogue, camera: shot.camera, action: shot.action, environment: shot.environment, lighting: shot.lighting },
    requiredSegments: base.map(segment => ({ segmentNumber: segment.segmentNumber, durationSec: segment.durationSec, startFrame: segment.startFrame, endFrame: segment.endFrame, actionBeat: segment.actionBeat }))
  };
  const prompts = promptsFor(route.settings, 'video', {
    projectTitle: project.title || '', segmentCount: base.length, aspectRatio: project.brief?.aspectRatio || '9:16',
    storyboardImageJson: JSON.stringify({ relativePath: shot.storyboardImageRelativePath, style: shot.storyboardStyle || project.brief?.storyboardStyle || '', generationMeta: shot.imageGenerationMeta || {}, attachedAsInputReference: true }, null, 2),
    contextJson: JSON.stringify(context, null, 2)
  });
  const generated = await generateStructuredWithVendor(route.vendor, route.key, route.model, prompts.user, route.timeoutMs, route.reasoningEffort, prompts.system);
  const list = Array.isArray(generated) ? generated : generated?.segments;
  if (!Array.isArray(list) || !list.length) throw Object.assign(new Error('AI did not return video segments'), { code: 'malformed_response' });
  return base.map((segment, index) => {
    const ai = list.find(item => Number(item?.segmentNumber) === index + 1) || list[index] || {};
    const videoPrompt = String(ai.videoPrompt || '').trim();
    if (!videoPrompt) throw Object.assign(new Error(`AI did not return videoPrompt for segment ${index + 1}`), { code: 'malformed_response' });
    return { ...segment, generationMode: 'image-to-video', sourceStoryboardRelativePath: shot.storyboardImageRelativePath, startFrame: String(ai.startFrame || segment.startFrame), endFrame: String(ai.endFrame || segment.endFrame), actionBeat: String(ai.actionBeat || segment.actionBeat), videoPrompt: enforceNoVisibleTextPrompt(videoPrompt, 'video'), videoNegativePrompt: enforceNoVisibleTextNegative(String(ai.videoNegativePrompt || segment.videoNegativePrompt)), generationMeta: { provider: route.vendor.id, model: route.model, promptVersion: 1, generationMode: 'image-to-video', sourceStoryboardRelativePath: shot.storyboardImageRelativePath, generatedAt: new Date().toISOString() } };
  });
}
function parseStructured(text) {
  if (typeof text !== 'string' || !text.trim()) throw Object.assign(new Error('AI provider returned an empty response'), { code: 'malformed_response' });
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); }
  catch { throw Object.assign(new Error('AI provider returned malformed JSON'), { code: 'malformed_response' }); }
}
async function testConnection(providerId) {
  const settings = await getSettings();
  const vendor = vendorFor(settings, providerId);
  if (!vendor) throw new Error('Unknown AI vendor');
  if (vendor.protocol === 'mock') return { ok: true, message: 'Mock provider พร้อมใช้งานแบบออฟไลน์' };
  const key = await getSecret(providerId);
  if (!key) return { ok: false, message: `ยังไม่ได้บันทึก API key สำหรับ ${vendor.name}` };
  if (!vendor.modelsEndpoint) return { ok: true, message: `บันทึก API key สำหรับ ${vendor.name} แล้ว (ไม่มี Models endpoint สำหรับทดสอบ)` };
  let url = validateEndpoint(vendor.modelsEndpoint);
  const headers = { accept: 'application/json' };
  if (vendor.protocol === 'gemini') url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
  else headers.authorization = `Bearer ${key}`;
  let response;
  try { response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(20_000) }); }
  catch { throw Object.assign(new Error(`เชื่อมต่อ ${vendor.name} ไม่สำเร็จ: network/timeout`), { code: 'network', retryable: true }); }
  if (!response.ok) throw Object.assign(new Error(`${vendor.name} ตอบกลับ HTTP ${response.status}`), classifyApiError(response.status));
  return { ok: true, message: `เชื่อมต่อ ${vendor.name} สำเร็จ` };
}
module.exports = { generateStory, generateCharacters, generateShotPrompt, generateVideoSegments, generateStructuredWithVendor, normalizeGeneratedStory, assignedCharacterContext, buildShotPrompt: mock.buildShotPrompt, buildSegments: mock.buildSegments, classifyApiError, requestJson, parseStructured, testConnection };
