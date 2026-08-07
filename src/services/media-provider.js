const fs = require('node:fs/promises');
const path = require('node:path');
const { getSettings, getSecret } = require('../main/settings-store');
const { classifyApiError } = require('../shared/api-errors');
const { validateEndpoint } = require('../shared/vendors');
const { assertRelativePath } = require('../main/validators');
const { detect } = require('../main/asset-manager');
const { stripAudioTrack } = require('../main/export-service');
const { enforceNoVisibleTextPrompt } = require('../prompts/prompt-builder');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function apiError(status, label) {
  return Object.assign(new Error(`${label} failed (${status})`), classifyApiError(status));
}
async function responseError(response, label) {
  let providerMessage = '';
  try {
    const data = await response.clone().json();
    providerMessage = String(data?.error?.message || data?.message || data?.error || '').trim();
  } catch {
    try { providerMessage = String(await response.text()).trim().slice(0, 1000); } catch { /* no readable response body */ }
  }
  const message = providerMessage || `${label} failed (${response.status})`;
  return Object.assign(new Error(message), classifyApiError(response.status, message), { details: { httpStatus: response.status, providerMessage: providerMessage.slice(0, 1000) } });
}
function safetyFrameVideoPrompt(value, project = {}, shot = {}, options = {}) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 6500);
  if (!raw) return '';
  const characters = (project.characters || []).filter(character => (shot.characters || []).includes(character.id));
  const hasMinor = characters.some(character => Number(character.ageYears) > 0 && Number(character.ageYears) < 18 || /เด็ก|วัยรุ่น|child|teen/i.test(`${character.lifeStage || ''} ${character.ageRange || ''}`));
  const castRule = hasMinor
    ? 'All people are wholly fictional. Any young character appears only in an age-appropriate, non-exploitative everyday safety-awareness context.'
    : 'All visible people are wholly fictional adult actors aged 25 or older; they do not depict, resemble, or imitate any real person or public figure.';
  if (options.strict) return enforceNoVisibleTextPrompt(`STRICT PUBLIC-SERVICE PREVENTION VIGNETTE. ${castRule} The attached fictional Storyboard is used only for its visual composition. Animate a calm awareness moment: the fictional subject pauses, notices a generic and unreadable caution symbol, sets the device down, takes a steady breath, and chooses to verify through a trusted channel off screen. Show only natural eye movement, breathing, a small reassuring nod, and restrained cinematic camera movement. Keep every screen abstract and blurred with no readable interface, names, messages, numbers, or personal details. Every face, name, and voice is original to this fictional production. The sole theme is caution, awareness, verification, and personal safety. End on a calm, safe composition.`.slice(0, 7800), 'video');
  if (/PUBLIC-SERVICE SAFETY DRAMATIZATION/i.test(raw)) return enforceNoVisibleTextPrompt(raw, 'video');
  const replacements = [
    [/\b(?:deepfake|voice[ -]?clon(?:e|ed|ing)|face[ -]?swap)\b/gi, 'synthetic-media warning cue'],
    [/\b(?:impersonat(?:e|es|ed|ing|ion)|identity theft)\b/gi, 'fictional misleading communication shown only as a safety warning'],
    [/\b(?:scammer|fraudster|criminal operator|fraud|fraudulent|scam|scamming|social engineering)\b/gi, 'fictional unsafe situation resolved through verification and prevention'],
    [/\b(?:bank transfer|transfer money|account number|one-time password|OTP)\b/gi, 'non-actionable safety warning'],
    [/(?:ปลอมเสียง|โคลนเสียง|ดีปเฟก|มิจฉาชีพ)/gi, 'สัญลักษณ์เตือนภัยจากสื่อสังเคราะห์ในเรื่องสมมติ'],
    [/(?:โอนเงิน|เลขบัญชี|รหัส OTP)/gi, 'คำขอที่มีความเสี่ยงโดยไม่แสดงรายละเอียดที่นำไปใช้ได้จริง']
  ];
  let cleaned = raw;
  for (const [pattern, replacement] of replacements) cleaned = cleaned.replace(pattern, replacement);
  cleaned = cleaned.replace(/(?:synthetic-media warning cue\s*){2,}/gi, 'synthetic-media warning cue ').replace(/(?:non-actionable safety warning\s*(?:and\s*)?){2,}/gi, 'non-actionable safety warning ');
  return enforceNoVisibleTextPrompt(`PUBLIC-SERVICE SAFETY DRAMATIZATION. ${castRule} This scene promotes awareness, verification, and prevention only. It contains no instructions, no actionable harmful behavior, and no operational details. Any phone or computer interface is generic, abstract, non-interactive, and contains no legible personal, financial, contact, credential, or transaction data. Every face, name, and voice is original to this fictional production. Animate only the harmless emotional reaction, natural body movement, and camera movement already present in the attached fictional Storyboard image. ${cleaned} End with a clear feeling of caution, verification, and personal safety.`.slice(0, 7800), 'video');
}
function sizeForImage(aspectRatio) {
  return aspectRatio === '9:16' ? '1024x1536' : aspectRatio === '16:9' ? '1536x1024' : '1024x1024';
}
function sizeForVideo(aspectRatio) {
  return aspectRatio === '9:16' ? '720x1280' : '1280x720';
}
function secondsForVideo(durationSec) {
  return Number(durationSec) <= 4 ? '4' : '8';
}
function storyboardStylePrompt(style) {
  const styles = {
    'Cinematic Color': 'cinematic color storyboard frame, polished previsualization, natural production color palette',
    'Photorealistic': 'photorealistic cinematic film still, realistic skin, materials and lighting',
    'Concept Art': 'polished cinematic concept art, expressive color and production design',
    'Anime / Manga': 'color anime storyboard frame, clean linework and cinematic cel shading',
    '3D Previsualization': 'high-quality color 3D previsualization frame, physically based materials and cinematic lighting',
    'Pencil Storyboard': 'traditional pencil storyboard frame on white paper, monochrome line art',
    'Black-and-white Ink': 'black-and-white storyboard frame, clean ink line art on white paper, no color'
  };
  return { style: styles[style] ? style : 'Cinematic Color', directive: styles[style] || styles['Cinematic Color'] };
}
const CHARACTER_STYLE_DIRECTIVES = Object.freeze({
  'Cinematic Realism': 'cinematic realistic character design with natural anatomy, film-quality lighting and believable materials',
  'Photorealistic': 'photorealistic live-action human reference photography with natural skin texture, realistic hair and studio lighting',
  '3D Character Concept': 'clearly computer-generated 3D character concept render, unmistakably CGI, stylized production-ready digital sculpt, non-photographic',
  '3D Cartoon': 'stylized 3D cartoon character render, rounded appealing forms, expressive face, colorful CGI materials, unmistakably animated and non-photographic',
  'Chibi': 'cute chibi character design, very large head, tiny compact body, short limbs, simplified features, expressive eyes, polished colorful illustration, non-photographic',
  'Shibi / Super-deformed': 'extreme super-deformed shibi character design, oversized head, miniature body, very short limbs, playful simplified shapes, non-photographic',
  'Anime / Manga': 'anime character model sheet, clean line art, cel shading, expressive stylized eyes and consistent animation proportions, non-photographic',
  'Stylized Illustration': 'stylized editorial character illustration, deliberate simplified shapes, expressive line and color design, non-photographic',
  'Pencil Concept Art': 'traditional pencil character concept sheet, visible graphite linework and light value shading on paper, non-photographic',
  'Clay / Stop-motion': 'handcrafted clay stop-motion character model, visible sculpted texture, miniature maquette proportions and soft studio lighting, non-photographic',
  'Low-poly 3D': 'stylized low-poly 3D character render, faceted geometry, simplified shapes and clean game-art materials, non-photographic',
  'Comic Book': 'graphic comic-book character design, confident ink contours, bold color blocks and controlled halftone shading, non-photographic',
  'Watercolor Illustration': 'hand-painted watercolor character illustration, soft pigment blooms, paper texture and gentle outlined forms, non-photographic'
});
function characterStyleDirective(value) {
  const style = String(value || 'Cinematic Realism').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Cinematic Realism';
  const directive = CHARACTER_STYLE_DIRECTIVES[style] || `custom visual style exactly described as: ${style}. Treat this as the highest-priority rendering direction and keep it identical in all views`;
  const photographic = style === 'Photorealistic' || style === 'Cinematic Realism' || (/photo(realistic)?|live[- ]?action|real[- ]?person/i.test(style) && !/3d|cartoon|chibi|shibi|anime|illustration|comic|watercolor|clay|low-poly/i.test(style));
  return { style, directive, photographic };
}
function characterSheetPrompt(character = {}) {
  const { style, directive, photographic } = characterStyleDirective(character.sheetStyle);
  const renderingExclusions = photographic ? 'Do not change the selected realistic rendering treatment.' : 'NOT a photograph, NOT photorealistic, NOT live-action, NOT a real-person studio photo. Do not let cinematic, realistic, skin, camera, or lighting words in the identity description override the selected stylized rendering.';
  return { style, prompt: `TASK:
Create one professional character turnaround reference sheet for one single consistent character named ${character.name || 'character'}.

STYLE LOCK — HIGHEST PRIORITY:
${directive}.
Apply this exact rendering style consistently to all four views. ${renderingExclusions}

LAYOUT:
Exactly four separate full-body views arranged left to right on one clean neutral background: front view, three-quarter front view, strict side profile, and back view. Neutral standing pose, arms relaxed, even lighting, unobstructed complete silhouette with feet visible.

CHARACTER IDENTITY:
Gender, life stage and age: ${character.gender || 'not specified'}; ${character.lifeStage || 'not specified'}; ${character.ageYears || character.ageRange || 'not specified'}.
Appearance: ${character.appearance || ''}.
Wardrobe: ${character.wardrobe || ''}.
Role and personality: ${character.role || ''}; ${character.personality || ''}.
Identity guide: ${character.visualConsistencyPrompt || ''}.
Same person, identical face design, body proportions, hairstyle, apparent age, wardrobe, colors, materials and accessories across every view, interpreted inside the STYLE LOCK.

CONSTRAINTS:
No extra people, no mixed rendering styles, no cropped body, no action pose, no captions, no labels, no logos, no watermark. Avoid: ${character.negativePrompt || 'identity drift, face change, wardrobe change, duplicate limbs'}.` };
}
async function requestImage(settings, key, body, label) {
  const endpoint = validateEndpoint(settings.endpoints?.openaiImage || 'https://api.openai.com/v1/images/generations');
  const requestBody = { ...body, prompt: enforceNoVisibleTextPrompt(body?.prompt, 'image') };
  let response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(Math.min(300, Math.max(60, Number(settings.requestTimeoutSec) || 120)) * 1000) }); }
  catch (error) { throw Object.assign(new Error(`${label} request timed out or network is offline`), { code: 'network', retryable: true, cause: error }); }
  if (!response.ok) throw await responseError(response, label);
  const data = await response.json();
  const encoded = data.data?.[0]?.b64_json || data.b64_json;
  if (typeof encoded !== 'string' || !encoded) throw Object.assign(new Error('Image API did not return image data'), { code: 'malformed_response' });
  if (encoded.length > 60_000_000) throw new Error('Generated image is too large');
  return Buffer.from(encoded, 'base64');
}
function collectCharacterReferences(project = {}, shot = {}) {
  const assigned = new Set(Array.isArray(shot.characters) ? shot.characters : []);
  return (project.characters || []).filter(character => assigned.has(character.id)).map(character => {
    const image = character.referenceImages?.find(item => item.isPrimary) || character.referenceImages?.[0];
    return { characterId: character.id, name: character.name, style: character.sheetStyle || project.brief?.characterStyle || '', relativePath: image?.relativePath || '' };
  });
}
async function readReferenceImage(root, relativePath, label, missingCode = 'configuration') {
  assertRelativePath(relativePath);
  const fullPath = path.join(root, ...String(relativePath).split('/'));
  let bytes;
  try { bytes = await fs.readFile(fullPath); }
  catch (error) { throw Object.assign(new Error(`${label} cannot be read: ${relativePath}`), { code: missingCode, cause: error }); }
  const type = detect(bytes.subarray(0, 32));
  if (!type?.mime?.startsWith('image/')) throw Object.assign(new Error(`${label} is not a supported image`), { code: 'configuration' });
  return { bytes, mime: type.mime, filename: path.basename(fullPath) };
}
async function requestImageEdit(settings, key, root, body, references, label) {
  const endpoint = validateEndpoint(settings.endpoints?.openaiImageEdit || 'https://api.openai.com/v1/images/edits');
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...body, prompt: enforceNoVisibleTextPrompt(body?.prompt, 'image') })) form.append(name, String(value));
  for (const reference of references) {
    if (!reference.relativePath) throw Object.assign(new Error(`Character ${reference.name || reference.characterId} has no Character Sheet/reference image`), { code: 'character_required' });
    const image = await readReferenceImage(root, reference.relativePath, `Character reference for ${reference.name || reference.characterId}`, 'character_required');
    form.append('image[]', new Blob([image.bytes], { type: image.mime }), image.filename);
  }
  let response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(Math.min(300, Math.max(60, Number(settings.requestTimeoutSec) || 120)) * 1000) }); }
  catch (error) { throw Object.assign(new Error(`${label} request timed out or network is offline`), { code: 'network', retryable: true, cause: error }); }
  if (!response.ok) throw await responseError(response, label);
  const data = await response.json();
  const encoded = data.data?.[0]?.b64_json || data.b64_json;
  if (typeof encoded !== 'string' || !encoded) throw Object.assign(new Error('Image Edit API did not return image data'), { code: 'malformed_response' });
  if (encoded.length > 60_000_000) throw new Error('Generated image is too large');
  return Buffer.from(encoded, 'base64');
}
async function generateStoryboardImage(root, payload) {
  const settings = await getSettings();
  const key = await getSecret('openai');
  if (!key) throw Object.assign(new Error('No OpenAI API key saved for image generation'), { code: 'authentication' });
  const shot = payload?.shot || {}, project = payload?.project || {}, scene = payload?.scene || {};
  if (!String(shot.imagePrompt || '').trim()) throw Object.assign(new Error('Create the storyboard prompt before generating an image'), { code: 'configuration' });
  const model = settings.models?.image || 'gpt-image-2';
  const selected = storyboardStylePrompt(shot.storyboardStyle || project.brief?.storyboardStyle);
  const references = collectCharacterReferences(project, shot);
  if ((shot.characters || []).length && references.length !== new Set(shot.characters).size) throw Object.assign(new Error('One or more assigned characters no longer exist in the Character Library'), { code: 'character_required' });
  const referenceNames = references.map(reference => reference.name).join(', ');
  const prompt = `${selected.directive}. Create one NEW production-ready story scene, no captions, no labels, no border text, no turnaround layout and no collage. Scene: ${scene.title || ''}. ${shot.imagePrompt}. ${references.length ? `The attached Character Sheet images belong, in order, to: ${referenceNames}. Use them as mandatory identity and visual-style references while composing this new scene.` : ''} Preserve only assigned Character Bible identities, gender, apparent age, face, hairstyle, body proportions, wardrobe and reference style exactly. Avoid: ${shot.imageNegativePrompt || ''}`;
  const requestBody = { model, prompt, size: sizeForImage(project.brief?.aspectRatio), quality: 'medium', output_format: 'png' };
  const image = references.length
    ? await requestImageEdit(settings, key, root, requestBody, references, 'OpenAI reference-based storyboard image edit')
    : await requestImage(settings, key, requestBody, 'OpenAI storyboard image generation');
  const safeShot = String(shot.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const relativePath = path.posix.join('storyboard-images', `ai-${safeShot}-${Date.now()}.png`);
  await fs.mkdir(path.join(root, 'storyboard-images'), { recursive: true });
  await fs.writeFile(path.join(root, ...relativePath.split('/')), image);
  return { relativePath, model, generatedAt: new Date().toISOString(), style: selected.style, generationMode: references.length ? 'reference-image-edit' : 'text-to-image', referenceCharacterIds: references.map(reference => reference.characterId), referenceCount: references.length };
}
async function generateCharacterSheet(root, payload) {
  const settings = await getSettings();
  const key = await getSecret('openai');
  if (!key) throw Object.assign(new Error('No OpenAI API key saved for character generation'), { code: 'authentication' });
  const character = payload?.character || {};
  if (!String(character.name || character.appearance || '').trim()) throw Object.assign(new Error('Character name or appearance is required'), { code: 'configuration' });
  const { style, prompt } = characterSheetPrompt(character);
  const model = settings.models?.image || 'gpt-image-2';
  const image = await requestImage(settings, key, { model, prompt, size: '1536x1024', quality: 'high', output_format: 'png' }, 'OpenAI character sheet generation');
  const safeCharacter = String(character.id || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const relativePath = path.posix.join('characters', `ai-sheet-${safeCharacter}-${Date.now()}.png`);
  await fs.mkdir(path.join(root, 'characters'), { recursive: true });
  await fs.writeFile(path.join(root, ...relativePath.split('/')), image);
  return { relativePath, model, style, generatedAt: new Date().toISOString() };
}
async function generateVideo(root, payload, onProgress = () => {}) {
  const settings = await getSettings();
  const key = await getSecret('openai');
  if (!key) throw Object.assign(new Error('No OpenAI API key saved for video generation'), { code: 'authentication' });
  const project = payload?.project || {}, shot = payload?.shot || {}, segment = payload?.segment || {};
  if (!String(segment.videoPrompt || '').trim()) throw Object.assign(new Error('Create Video Segments before generating video'), { code: 'configuration' });
  if (!String(shot.storyboardImageRelativePath || '').trim()) throw Object.assign(new Error('Create the Storyboard image before generating image-to-video'), { code: 'storyboard_required' });
  const model = settings.models?.videoGeneration || 'sora-2';
  const endpoint = validateEndpoint(settings.endpoints?.openaiVideo || 'https://api.openai.com/v1/videos');
  const form = new FormData();
  const submittedPrompt = enforceNoVisibleTextPrompt(safetyFrameVideoPrompt(segment.videoPrompt, project, shot), 'video');
  form.append('model', model); form.append('prompt', submittedPrompt);
  form.append('seconds', secondsForVideo(segment.durationSec)); form.append('size', sizeForVideo(project.brief?.aspectRatio));
  {
      const reference = await readReferenceImage(root, shot.storyboardImageRelativePath, 'Storyboard input reference', 'storyboard_required');
      const full = path.join(root, ...String(shot.storyboardImageRelativePath).split('/'));
      let bytes = reference.bytes; const type = { mime: reference.mime };
      {
        let mime = type.mime, filename = path.basename(full);
        try { const { nativeImage } = require('electron'); const [width,height] = sizeForVideo(project.brief?.aspectRatio).split('x').map(Number); let image = nativeImage.createFromBuffer(bytes); if (!image.isEmpty()) { const source=image.getSize(),targetRatio=width/height,sourceRatio=source.width/source.height; if(sourceRatio>targetRatio){const cropWidth=Math.round(source.height*targetRatio);image=image.crop({x:Math.round((source.width-cropWidth)/2),y:0,width:cropWidth,height:source.height});}else if(sourceRatio<targetRatio){const cropHeight=Math.round(source.width/targetRatio);image=image.crop({x:0,y:Math.round((source.height-cropHeight)/2),width:source.width,height:cropHeight});} bytes = image.resize({ width, height, quality: 'best' }).toPNG(); mime = 'image/png'; filename = `${path.parse(filename).name}.png`; } } catch { /* keep original reference when native resize is unavailable */ }
        form.append('input_reference', new Blob([bytes], { type: mime }), filename);
      }
  }
  let response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60_000) }); }
  catch (error) { throw Object.assign(new Error('Video request timed out or network is offline'), { code: 'network', retryable: true, cause: error }); }
  if (!response.ok) {
    const error = await responseError(response, 'OpenAI video generation');
    error.details = { ...(error.details || {}), safetyFramingApplied: true };
    throw error;
  }
  let job = await response.json();
  if (!job?.id) throw Object.assign(new Error('Video API did not return a job ID'), { code: 'malformed_response' });
  onProgress(Number(job.progress) || 1, job.status || 'queued', { jobId: job.id });
  const deadline = Date.now() + 12 * 60_000;
  let consecutivePollFailures = 0;
  while (!['completed','failed','cancelled'].includes(job.status)) {
    if (Date.now() >= deadline) throw Object.assign(new Error('Video generation exceeded 12 minutes'), { code: 'timeout', retryable: true });
    await delay(3000);
    let statusResponse;
    try { statusResponse = await fetch(`${endpoint}/${encodeURIComponent(job.id)}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) }); }
    catch (error) {
      consecutivePollFailures++;
      if (consecutivePollFailures <= 3) { onProgress(Number(job.progress) || 1, `reconnecting ${consecutivePollFailures}/3`, { jobId: job.id }); continue; }
      throw Object.assign(new Error('Video status connection failed after 3 retries'), { code: 'network', retryable: true, cause: error, details: { jobId: job.id, status: job.status } });
    }
    if (!statusResponse.ok) {
      if ([429,500,502,503,504].includes(statusResponse.status) && ++consecutivePollFailures <= 3) { onProgress(Number(job.progress) || 1, `reconnecting ${consecutivePollFailures}/3`, { jobId: job.id }); continue; }
      throw await responseError(statusResponse, 'OpenAI video status');
    }
    consecutivePollFailures = 0;
    job = await statusResponse.json();
    onProgress(Number(job.progress) || 1, job.status || 'processing', { jobId: job.id });
  }
  if (job.status !== 'completed') {
    const message = job.error?.message || `Video generation ${job.status}`;
    const blocked = /moderation|blocked|content policy|safety/i.test(message) || /moderation|policy|safety/i.test(job.error?.code || '');
    throw Object.assign(new Error(message), { code: blocked ? 'content_policy' : 'provider_error', retryable: false, details: { jobId: job.id, status: job.status, providerCode: job.error?.code || '', safetyFramingApplied: true } });
  }
  const content = await fetch(`${endpoint}/${encodeURIComponent(job.id)}/content`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(120_000) });
  if (!content.ok) throw await responseError(content, 'OpenAI video download');
  const safeId = String(job.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const relativePath = path.posix.join('video-clips', `ai-${safeId}.mp4`);
  await fs.mkdir(path.join(root, 'video-clips'), { recursive: true });
  const outputPath = path.join(root, ...relativePath.split('/'));
  const sourcePath = path.join(root, 'video-clips', `ai-${safeId}-source-with-audio.mp4`);
  await fs.writeFile(sourcePath, Buffer.from(await content.arrayBuffer()));
  onProgress(98, 'removing generated audio', { jobId: job.id });
  try { await stripAudioTrack(sourcePath, outputPath, settings.ffmpegPath); }
  catch (error) { await fs.rm(outputPath, { force: true }); throw error; }
  finally { await fs.rm(sourcePath, { force: true }); }
  onProgress(100, 'completed', { jobId: job.id });
  return { relativePath, jobId: job.id, model, generationMode: 'image-to-video', audioRemoved: true, safetyFramingApplied: true, submittedPrompt, inputReferenceRelativePath: shot.storyboardImageRelativePath, generatedSeconds: Number(job.seconds) || Number(secondsForVideo(segment.durationSec)), generatedAt: new Date().toISOString() };
}

module.exports = { generateStoryboardImage, generateCharacterSheet, generateVideo, sizeForImage, sizeForVideo, secondsForVideo, characterSheetPrompt, characterStyleDirective, storyboardStylePrompt, collectCharacterReferences, requestImageEdit, safetyFrameVideoPrompt, responseError, CHARACTER_STYLE_DIRECTIVES };
