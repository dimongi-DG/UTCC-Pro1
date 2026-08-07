const SCHEMA_VERSION = 1;
const { DEFAULT_VENDORS } = require('./vendors');
const { defaultPromptTemplates } = require('./prompt-templates');
const ASSET_DIRS = Object.freeze({
  character: 'characters', storyboardImage: 'storyboard-images',
  video: 'video-clips', voice: 'voices', music: 'music', sfx: 'sfx'
});
const PROJECT_DIRS = Object.freeze([...new Set([...Object.values(ASSET_DIRS), 'prompts', 'exports', 'temp'])]);
const DEFAULT_SETTINGS = Object.freeze({
  autosaveIntervalMs: 1200,
  requestTimeoutSec: 120,
  defaultLanguage: 'ไทย', defaultPlatform: 'TikTok', defaultAspectRatio: '9:16',
  promptLanguage: 'English', ffmpegPath: '', exportPreset: '1080x1920',
  models: { story: 'mock-story-v1', storyboard: 'mock-visual-v1', video: 'mock-motion-v1', tts: 'mock-voice-v1', image: 'gpt-image-2', videoGeneration: 'sora-2' },
  providers: { story: 'mock', storyboard: 'mock', video: 'mock', tts: 'mock' },
  reasoning: { story: 'medium', storyboard: 'low', video: 'low' },
  endpoints: { openaiTts: 'https://api.openai.com/v1/audio/speech', openaiImage: 'https://api.openai.com/v1/images/generations', openaiImageEdit: 'https://api.openai.com/v1/images/edits', openaiVideo: 'https://api.openai.com/v1/videos' },
  aiVendors: DEFAULT_VENDORS,
  promptTemplates: defaultPromptTemplates()
});
module.exports = { SCHEMA_VERSION, ASSET_DIRS, PROJECT_DIRS, DEFAULT_SETTINGS };
