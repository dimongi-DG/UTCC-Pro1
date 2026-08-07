const FORMAT = 'clip-story-studio-settings';
const FORMAT_VERSION = 1;
const PORTABLE_KEYS = Object.freeze([
  'autosaveIntervalMs', 'requestTimeoutSec', 'defaultLanguage', 'defaultPlatform', 'defaultAspectRatio',
  'promptLanguage', 'ffmpegPath', 'exportPreset', 'models', 'providers', 'reasoning', 'endpoints', 'aiVendors', 'promptTemplates'
]);

function createSettingsBundle(settings, appVersion = '') {
  const portable = {};
  for (const key of PORTABLE_KEYS) if (settings?.[key] !== undefined) portable[key] = JSON.parse(JSON.stringify(settings[key]));
  return { format: FORMAT, formatVersion: FORMAT_VERSION, appVersion: String(appVersion || ''), exportedAt: new Date().toISOString(), containsApiKeys: false, settings: portable };
}

function parseSettingsBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('Settings file must contain a JSON object');
  if (bundle.format !== FORMAT) throw new Error('This is not a Clip Story Studio settings file');
  if (Number(bundle.formatVersion) !== FORMAT_VERSION) throw new Error(`Unsupported settings format version: ${bundle.formatVersion}`);
  if (!bundle.settings || typeof bundle.settings !== 'object' || Array.isArray(bundle.settings)) throw new Error('Settings file does not contain usable settings');
  const portable = {};
  for (const key of PORTABLE_KEYS) if (bundle.settings[key] !== undefined) portable[key] = JSON.parse(JSON.stringify(bundle.settings[key]));
  return portable;
}

module.exports = { FORMAT, FORMAT_VERSION, PORTABLE_KEYS, createSettingsBundle, parseSettingsBundle };
