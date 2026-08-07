const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { id } = require('../shared/utils');

const VOICES = [
  { id: 'th-female-warm', name: 'มะลิ — อบอุ่น', language: 'th-TH', gender: 'female', supportsEmotion: true },
  { id: 'th-male-calm', name: 'นนท์ — สุขุม', language: 'th-TH', gender: 'male', supportsEmotion: true },
  { id: 'en-neutral', name: 'River — Neutral', language: 'en-US', gender: 'neutral', supportsEmotion: false },
  ...['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar']
    .map(voice => ({ id: voice, name: `OpenAI — ${voice}`, language: 'multilingual', gender: 'neutral', supportsEmotion: true }))
];
const VOICE_ALIASES = Object.freeze({
  'th-female-warm': 'coral',
  'th-male-calm': 'onyx',
  'en-neutral': 'alloy'
});
const OPENAI_VOICES = new Set(['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar']);
function resolveOpenAIVoice(voiceId) {
  const requested = String(voiceId || '').trim();
  return VOICE_ALIASES[requested] || (OPENAI_VOICES.has(requested) ? requested : 'alloy');
}
function cacheKey(text, voice, settings = {}) {
  return crypto.createHash('sha256').update(JSON.stringify({ text, voice, ...settings, rate: settings.rate || 1, emotion: settings.emotion || '', delivery: settings.delivery || '', characterProfile: settings.characterProfile || null })).digest('hex');
}
function speechInstructions(payload = {}) {
  const profile = payload.characterProfile && typeof payload.characterProfile === 'object' ? payload.characterProfile : {};
  const voice = profile.voiceProfile && typeof profile.voiceProfile === 'object' ? profile.voiceProfile : {};
  const presentation = [payload.voiceId,profile.gender,voice.genderPresentation].filter(Boolean).join(' ').toLowerCase();
  const feminine = presentation.includes('th-female') || /หญิง|female|woman|girl/i.test(presentation);
  const masculine = !feminine && (presentation.includes('th-male') || /ชาย|\bmale\b|\bman\b|\bboy\b/i.test(presentation));
  const parts = [
    String(payload.language || '').toLowerCase().startsWith('th') && 'Speak the supplied text in native Thai only, with accurate Thai pronunciation, natural Thai sentence rhythm, and clear word boundaries',
    feminine && "Use a clearly feminine voice presentation matching the character's stated age throughout; it must be readily perceived as a Thai woman or girl, never masculine or androgynous",
    masculine && "Use a clearly masculine voice presentation matching the character's stated age throughout; it must be readily perceived as a Thai man or boy, never feminine or androgynous",
    payload.emotion && `Emotion: ${payload.emotion}`,
    payload.delivery && `Delivery: ${payload.delivery}`,
    profile.gender && `Character gender: ${profile.gender}`,
    profile.lifeStage && `Life stage: ${profile.lifeStage}`,
    profile.ageYears && `Age: ${profile.ageYears}`,
    profile.personality && `Personality: ${profile.personality}`,
    profile.speakingStyle && `Speaking style: ${profile.speakingStyle}`,
    voice.genderPresentation && `Voice presentation: ${voice.genderPresentation}`,
    voice.ageImpression && `Age impression: ${voice.ageImpression}`,
    voice.tone && `Tone: ${voice.tone}`,
    voice.pace && `Pacing character: ${voice.pace}`,
    voice.accent && `Accent: ${voice.accent}`
  ].filter(Boolean);
  return parts.length ? `Perform this line consistently with the Character Bible. ${parts.join('. ')}. Use natural pacing; do not add words.`.slice(0, 1800) : '';
}
function estimateDuration(text, language = 'th', rate = 1) {
  const units = language.startsWith('th') ? String(text).replace(/\s/g, '').length / 5 : String(text).trim().split(/\s+/).length;
  const perMinute = language.startsWith('th') ? 150 : 145;
  return Math.max(1, units / perMinute * 60 / Math.max(.5, rate));
}
function createWav(durationSec, frequency = 220) {
  const sampleRate = 22050, channels = 1, bits = 16;
  const samples = Math.ceil(durationSec * sampleRate);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * channels * bits / 8, 28);
  buffer.writeUInt16LE(channels * bits / 8, 32); buffer.writeUInt16LE(bits, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 400, (samples - i) / 400);
    const value = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.08 * envelope;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}
async function synthesizeMock(root, payload) {
  const key = cacheKey(payload.text, payload.voiceId, payload);
  const relativePath = path.posix.join('voices', `${payload.dialogueId || id('line')}-${key.slice(0, 10)}.wav`);
  const full = path.join(root, ...relativePath.split('/'));
  if (!payload.forceRegenerate) {
    try { await fs.access(full); return { relativePath, durationSec: estimateDuration(payload.text, payload.language, payload.rate), cached: true, cacheKey: key, requestedVoice: payload.voiceId, providerVoice: payload.voiceId, instructionsApplied: false }; } catch { /* generate */ }
  }
  const durationSec = estimateDuration(payload.text, payload.language, payload.rate);
  await fs.writeFile(full, createWav(durationSec, payload.voiceId?.includes('male') ? 170 : 230));
  return { relativePath, durationSec, cached: false, cacheKey: key, requestedVoice: payload.voiceId, providerVoice: payload.voiceId, instructionsApplied: false };
}
async function synthesizeOpenAI(root, payload, settings, apiKey) {
  const voice = resolveOpenAIVoice(payload.voiceId);
  const configuredModel = settings.models?.tts || '';
  const model = configuredModel.startsWith('mock-') ? 'gpt-4o-mini-tts' : configuredModel;
  const format = ['mp3','opus','aac','flac','wav','pcm'].includes(payload.outputFormat) ? payload.outputFormat : 'mp3';
  const key = cacheKey(payload.text, voice, { provider: 'openai', model, rate: payload.rate, emotion: payload.emotion, delivery: payload.delivery, characterProfile: payload.characterProfile, language: payload.language, voicePromptVersion: 2, format });
  const relativePath = path.posix.join('voices', `${payload.dialogueId || id('line')}-${key.slice(0, 10)}.${format}`);
  const full = path.join(root, ...relativePath.split('/'));
  const instructions = speechInstructions(payload);
  if (!payload.forceRegenerate) {
    try { await fs.access(full); return { relativePath, durationSec: estimateDuration(payload.text, payload.language, payload.rate), cached: true, cacheKey: key, requestedVoice: payload.voiceId, providerVoice: voice, instructionsApplied: Boolean(instructions) }; } catch { /* request */ }
  }
  const body = { model, input: String(payload.text).slice(0, 4096), voice, response_format: format, speed: Math.min(4, Math.max(.25, Number(payload.rate) || 1)) };
  if (instructions && !['tts-1','tts-1-hd'].includes(model)) body.instructions = instructions;
  const endpoint = settings.endpoints?.openaiTts || 'https://api.openai.com/v1/audio/speech';
  let response;
  try { response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) }); }
  catch (error) { throw Object.assign(new Error('TTS network offline or timed out'), { code: 'network', retryable: true, cause: error }); }
  if (!response.ok) {
    const { classifyApiError } = require('../shared/api-errors');
    throw Object.assign(new Error(`OpenAI TTS failed (${response.status})`), classifyApiError(response.status));
  }
  await fs.writeFile(full, Buffer.from(await response.arrayBuffer()));
  return { relativePath, durationSec: estimateDuration(payload.text, payload.language, payload.rate), cached: false, cacheKey: key, requestedVoice: payload.voiceId, providerVoice: voice, instructionsApplied: Boolean(instructions) };
}
async function synthesize(root, payload) {
  const { getSettings, getSecret } = require('../main/settings-store');
  const settings = await getSettings();
  const provider = settings.providers?.tts || 'mock';
  if (provider === 'mock') return synthesizeMock(root, payload);
  if (provider !== 'openai') throw Object.assign(new Error(`${provider} TTS is not supported by this build`), { code: 'unsupported_capability' });
  const key = await getSecret('openai');
  if (!key) throw Object.assign(new Error('No OpenAI API key saved'), { code: 'authentication' });
  return synthesizeOpenAI(root, payload, settings, key);
}
module.exports = { VOICES, VOICE_ALIASES, resolveOpenAIVoice, cacheKey, speechInstructions, estimateDuration, createWav, synthesizeMock, synthesizeOpenAI, synthesize };
