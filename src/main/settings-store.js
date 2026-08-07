const fs = require('node:fs/promises');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { DEFAULT_SETTINGS } = require('../shared/constants');
const { writeAtomic } = require('./project-store');
const { safeVendorId, normalizeVendors, validateVendors, validateEndpoint } = require('../shared/vendors');
const { createSettingsBundle, parseSettingsBundle } = require('../shared/settings-transfer');
const { defaultPromptTemplates, normalizePromptTemplates, validatePromptTemplates } = require('../shared/prompt-templates');

const filePath = () => path.join(app.getPath('userData'), 'settings.json');
async function raw() {
  try { return JSON.parse(await fs.readFile(filePath(), 'utf8')); }
  catch { return { ...DEFAULT_SETTINGS, secrets: {} }; }
}
async function getSettings() {
  const settings = await raw();
  const secretsConfigured = Object.fromEntries(Object.keys(settings.secrets || {}).map(key => [key, true]));
  delete settings.secrets;
  return { ...DEFAULT_SETTINGS, ...settings, models: { ...DEFAULT_SETTINGS.models, ...(settings.models || {}) }, providers: { ...DEFAULT_SETTINGS.providers, ...(settings.providers || {}) }, reasoning: { ...DEFAULT_SETTINGS.reasoning, ...(settings.reasoning || {}) }, endpoints: { ...DEFAULT_SETTINGS.endpoints, ...(settings.endpoints || {}) }, aiVendors: normalizeVendors(settings.aiVendors), promptTemplates: normalizePromptTemplates(settings.promptTemplates), promptTemplateDefaults: defaultPromptTemplates(), secretsConfigured, encryptionAvailable: safeStorage.isEncryptionAvailable() };
}
async function saveSettings(input) {
  const current = await raw();
  const allowed = ['autosaveIntervalMs', 'requestTimeoutSec', 'defaultLanguage', 'defaultPlatform', 'defaultAspectRatio', 'promptLanguage', 'ffmpegPath', 'exportPreset', 'models', 'providers', 'reasoning', 'endpoints'];
  for (const key of allowed) if (input[key] !== undefined) current[key] = input[key];
  current.aiVendors = validateVendors(input.aiVendors !== undefined ? input.aiVendors : normalizeVendors(current.aiVendors));
  current.promptTemplates = validatePromptTemplates(input.promptTemplates !== undefined ? input.promptTemplates : current.promptTemplates);
  current.requestTimeoutSec = Math.min(300, Math.max(30, Number(current.requestTimeoutSec) || 120));
  current.endpoints = { ...DEFAULT_SETTINGS.endpoints, ...(current.endpoints && typeof current.endpoints === 'object' ? current.endpoints : {}) };
  current.endpoints.openaiTts = validateEndpoint(current.endpoints.openaiTts);
  current.endpoints.openaiImage = validateEndpoint(current.endpoints.openaiImage);
  current.endpoints.openaiImageEdit = validateEndpoint(current.endpoints.openaiImageEdit);
  current.endpoints.openaiVideo = validateEndpoint(current.endpoints.openaiVideo);
  const vendorMap = new Map(current.aiVendors.map(v => [v.id, v]));
  for (const capability of ['story', 'storyboard', 'video', 'tts']) {
    const vendor = vendorMap.get(current.providers?.[capability]);
    const required = capability === 'tts' ? 'tts' : 'text';
    if (!vendor || !vendor.capabilities.includes(required)) throw new Error(`Vendor for ${capability} does not support ${required}`);
    if (typeof current.models?.[capability] !== 'string' || current.models[capability].length > 160) throw new Error(`Invalid model ID for ${capability}`);
  }
  for (const capability of ['image', 'videoGeneration']) {
    if (typeof current.models?.[capability] !== 'string' || !current.models[capability] || current.models[capability].length > 160) throw new Error(`Invalid model ID for ${capability}`);
  }
  for (const capability of ['story', 'storyboard', 'video']) {
    if (!['none','low','medium','high','xhigh','max'].includes(current.reasoning?.[capability])) throw new Error(`Invalid reasoning effort for ${capability}`);
  }
  await writeAtomic(filePath(), current, false);
  return getSettings();
}
async function saveSecret(provider, secret) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is unavailable. The key was not saved.');
  provider = safeVendorId(provider);
  const currentSettings = await getSettings();
  if (!currentSettings.aiVendors.some(v => v.id === provider)) throw new Error('Unsupported provider');
  if (!String(secret || '').trim() || String(secret).length > 8192) throw new Error('Invalid API key');
  const current = await raw();
  current.secrets ||= {};
  current.secrets[provider] = safeStorage.encryptString(String(secret)).toString('base64');
  await writeAtomic(filePath(), current, false);
  return { configured: true };
}
async function deleteSecret(provider) {
  provider = safeVendorId(provider);
  const current = await raw();
  delete current.secrets?.[provider];
  await writeAtomic(filePath(), current, false);
  return { configured: false };
}
async function getSecret(provider) {
  provider = safeVendorId(provider);
  const current = await raw();
  const encrypted = current.secrets?.[provider];
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return '';
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}
async function exportPortableSettings(appVersion) {
  return createSettingsBundle(await getSettings(), appVersion);
}
async function importPortableSettings(bundle) {
  return saveSettings(parseSettingsBundle(bundle));
}
module.exports = { getSettings, saveSettings, saveSecret, deleteSecret, getSecret, exportPortableSettings, importPortableSettings };
