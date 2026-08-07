const { id } = require('./utils');
const { enforceNoVisibleTextPrompt, enforceNoVisibleTextNegative } = require('../prompts/prompt-builder');

const text = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return fallback;
};

function malformed(message) {
  return Object.assign(new Error(message), { code: 'malformed_response', retryable: false });
}

function characterId(value, characters = [], fallback = '') {
  const raw = text(value);
  if (!raw || raw === 'narrator') return raw || fallback;
  const lowered = raw.toLowerCase();
  const match = characters.find(character => [character.id, character.name, character.role].some(candidate => text(candidate).toLowerCase() === lowered));
  return match?.id || fallback;
}

function normalizeDialogue(value, fallbackText, characters = []) {
  const lines = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = lines.map((line, index) => {
    if (typeof line === 'string') return { id: id('line'), speakerId: 'narrator', listenerIds: [], text: line, emotion: 'neutral', delivery: 'natural', pace: 1, startSec: index * 3, estimatedDurationSec: 3, audioRelativePath: '' };
    if (!line || typeof line !== 'object') return null;
    return {
      id: text(line.id) || id('line'), speakerId: characterId(line.speakerId || line.speaker || line.character, characters, 'narrator'),
      listenerIds: [...new Set((Array.isArray(line.listenerIds) ? line.listenerIds : []).map(value => characterId(value, characters)).filter(Boolean))],
      text: text(line.text || line.dialogue || line.line), emotion: text(line.emotion, 'neutral'), delivery: text(line.delivery, 'natural'),
      pace: Number(line.pace) || 1, startSec: Math.max(0, Number(line.startSec) || 0),
      estimatedDurationSec: Math.max(1, Number(line.estimatedDurationSec || line.durationSec) || 3), audioRelativePath: ''
    };
  }).filter(Boolean).filter(line => line.text);
  if (normalized.length) return normalized;
  return fallbackText ? [{ id: id('line'), speakerId: 'narrator', listenerIds: [], text: fallbackText, emotion: 'neutral', delivery: 'natural', pace: 1, startSec: 0, estimatedDurationSec: 3, audioRelativePath: '' }] : [];
}

function normalizeShot(raw, shotNumber, scenePurpose, defaultDuration, characters = []) {
  const shot = raw && typeof raw === 'object' ? raw : {};
  const description = text(shot.description || shot.visual || shot.summary || shot.action, scenePurpose || `Shot ${shotNumber}`);
  const camera = shot.camera && typeof shot.camera === 'object' ? shot.camera : {};
  return {
    id: text(shot.id) || id('shot'), shotNumber,
    plannedDurationSec: Math.max(1, Number(shot.plannedDurationSec || shot.durationSec || shot.duration) || defaultDuration),
    description, purpose: text(shot.purpose, scenePurpose), characters: (() => {
      const assigned = (Array.isArray(shot.characters) ? shot.characters : []).map(value => characterId(value, characters)).filter(Boolean);
      return [...new Set(assigned.length ? assigned : characters.slice(0, 1).map(character => character.id))];
    })(),
    dialogue: normalizeDialogue(shot.dialogue || shot.dialogues || shot.lines, text(shot.narration || shot.voiceover), characters),
    camera: {
      shotSize: text(camera.shotSize || shot.shotSize, 'Medium shot'), angle: text(camera.angle || shot.angle, 'Eye-level'),
      movement: text(camera.movement || shot.cameraMovement, 'Static'), lens: text(camera.lens, '35mm')
    },
    action: text(shot.action, description), environment: text(shot.environment || shot.location), lighting: text(shot.lighting, 'cinematic light'),
    imagePrompt: enforceNoVisibleTextPrompt(text(shot.imagePrompt), 'image'), imageNegativePrompt: enforceNoVisibleTextNegative(text(shot.imageNegativePrompt)), storyboardStyle: text(shot.storyboardStyle), storyboardImageRelativePath: '',
    videoSegments: [], status: 'draft', locked: false
  };
}

function normalizeGeneratedStory(raw, project = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw malformed('AI response must be a JSON object containing story and scenes');
  const root = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  const storyInput = root.story && typeof root.story === 'object' && !Array.isArray(root.story) ? root.story : {};
  const rawScenes = Array.isArray(root.scenes) ? root.scenes : Array.isArray(storyInput.scenes) ? storyInput.scenes : null;
  if (!rawScenes?.length) throw malformed('AI response does not contain a usable scenes array');
  const brief = project.brief || {};
  const target = Math.max(12, Number(brief.targetDurationSec) || 30);
  const usableScenes = rawScenes.filter(scene => scene && typeof scene === 'object');
  if (!usableScenes.length) throw malformed('AI response contains no valid scenes');
  const defaultSceneDuration = Math.max(3, Math.round(target / usableScenes.length));
  const scenes = usableScenes.map((scene, sceneIndex) => {
    const purpose = text(scene.purpose || scene.summary || scene.description, `เหตุการณ์สำคัญลำดับที่ ${sceneIndex + 1}`);
    const suppliedShots = Array.isArray(scene.shots) ? scene.shots.filter(shot => shot && typeof shot === 'object') : [];
    const rawShots = suppliedShots.length ? suppliedShots : [{ description: purpose, dialogue: scene.dialogue || scene.narration }];
    const shotDuration = Math.max(1, Math.round(defaultSceneDuration / rawShots.length));
    return {
      id: text(scene.id) || id('scene'), sceneNumber: sceneIndex + 1,
      title: text(scene.title || scene.name, `Scene ${sceneIndex + 1}`), purpose,
      location: text(scene.location || scene.setting), timeOfDay: text(scene.timeOfDay, 'day'),
      settingDescription: text(scene.settingDescription || scene.settingDetails), atmosphere: text(scene.atmosphere),
      mood: text(scene.mood || scene.tone, brief.tone || ''), tone: text(scene.tone, scene.mood || brief.tone || ''),
      narrativeBeat: text(scene.narrativeBeat, purpose), emotionalArc: text(scene.emotionalArc),
      locked: false, shots: rawShots.map((shot, shotIndex) => normalizeShot(shot, shotIndex + 1, purpose, shotDuration, project.characters || []))
    };
  });
  const title = text(storyInput.title || root.title, project.title || 'เรื่องใหม่');
  return {
    story: {
      title, hook: text(storyInput.hook, scenes[0].purpose), opening: text(storyInput.opening, scenes[0].purpose),
      logline: text(storyInput.logline || storyInput.summary, brief.concept || title),
      synopsis: text(storyInput.synopsis || storyInput.summary, scenes.map(scene => scene.purpose).join(' — ')), climax: text(storyInput.climax),
      ending: text(storyInput.ending, scenes.at(-1).purpose), callToAction: text(storyInput.callToAction, brief.callToAction || '')
    },
    scenes
  };
}

module.exports = { normalizeGeneratedStory };
