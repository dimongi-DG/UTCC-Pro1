const { SCHEMA_VERSION } = require('./constants');
const { id, now, clamp } = require('./utils');

function createEmptyProject(title = 'โปรเจกต์ใหม่', defaults = {}) {
  const stamp = now();
  return {
    id: id('project'), schemaVersion: SCHEMA_VERSION, title,
    brief: {
      concept: '', keyMessage: '', targetAudience: '', genre: 'อบอุ่น', tone: 'สร้างแรงบันดาลใจ',
      language: defaults.defaultLanguage || 'ไทย', visualStyle: 'Cinematic realism',
      characterStyle: 'Cinematic Realism',
      storyboardStyle: 'Cinematic Color',
      aspectRatio: defaults.defaultAspectRatio || '9:16', targetDurationSec: 30,
      platform: defaults.defaultPlatform || 'TikTok', callToAction: '', constraints: ''
    },
    story: { title: '', logline: '', synopsis: '', hook: '', opening: '', climax: '', ending: '', callToAction: '' },
    characters: [], scenes: [], voiceAssignments: { narrator: 'th-female-warm' },
    workflowSync: { briefRevision: 0, briefChangedAt: '', changedFields: [], stale: { characters: false, story: false, storyboard: false, video: false, voice: false, timeline: false } },
    timeline: { fitMode: 'crop', musicRelativePath: '', musicVolume: 0.25, sfx: [] },
    promptVersions: {}, createdAt: stamp, updatedAt: stamp
  };
}

function splitDuration(durationSec) {
  let remaining = Math.max(1, Math.round(Number(durationSec) || 1));
  const segments = [];
  while (remaining > 0) {
    const duration = Math.min(8, remaining);
    segments.push(duration);
    remaining -= duration;
  }
  return segments;
}

function validateProject(project) {
  const errors = [];
  if (!project || typeof project !== 'object') return ['Project must be an object'];
  if (!project.id || !project.title) errors.push('Project id/title is required');
  if (!Array.isArray(project.scenes)) errors.push('Scenes must be an array');
  for (const scene of project.scenes || []) {
    if (!Array.isArray(scene.shots)) errors.push(`Scene ${scene.sceneNumber} has invalid shots`);
    const shotNumbers = new Set();
    for (const shot of scene.shots || []) {
      if (shotNumbers.has(shot.shotNumber)) errors.push(`Duplicate shot ${shot.shotNumber}`);
      shotNumbers.add(shot.shotNumber);
      if (!(Number(shot.plannedDurationSec) > 0)) errors.push(`Shot ${shot.shotNumber} duration must be positive`);
      for (const segment of shot.videoSegments || []) {
        if (!(segment.durationSec > 0 && segment.durationSec <= 8)) errors.push(`Segment ${segment.id} must be 1–8 seconds`);
      }
    }
  }
  return errors;
}

function normalizeProject(project) {
  project.schemaVersion = SCHEMA_VERSION;
  project.updatedAt = now();
  project.characters ||= [];
  project.brief ||= {};
  project.brief.characterStyle ||= 'Cinematic Realism';
  project.brief.storyboardStyle ||= 'Cinematic Color';
  project.scenes ||= [];
  project.voiceAssignments ||= { narrator: 'th-female-warm' };
  project.workflowSync ||= { briefRevision: 0, briefChangedAt: '', changedFields: [], stale: {} };
  project.workflowSync.changedFields ||= [];
  project.workflowSync.stale = { characters: false, story: false, storyboard: false, video: false, voice: false, timeline: false, ...(project.workflowSync.stale || {}) };
  project.timeline ||= { fitMode: 'crop', musicRelativePath: '', musicVolume: 0.25, sfx: [] };
  for (const character of project.characters) {
    character.gender ||= '';
    character.lifeStage ||= '';
    character.ageYears = Math.max(0, Number(character.ageYears) || Number(String(character.ageRange || '').match(/\d+/)?.[0]) || 0);
    character.voiceProfile = {
      genderPresentation: '', ageImpression: '', tone: '', pace: '', accent: '',
      ...(character.voiceProfile && typeof character.voiceProfile === 'object' ? character.voiceProfile : {})
    };
    character.referenceImages ||= [];
  }
  for (const [sIndex, scene] of project.scenes.entries()) {
    scene.sceneNumber = sIndex + 1; scene.shots ||= [];
    scene.settingDescription ||= '';
    scene.atmosphere ||= '';
    scene.tone ||= scene.mood || '';
    scene.narrativeBeat ||= scene.purpose || '';
    scene.emotionalArc ||= '';
    for (const [hIndex, shot] of scene.shots.entries()) {
      shot.shotNumber = hIndex + 1;
      shot.plannedDurationSec = Math.max(1, Number(shot.plannedDurationSec) || 1);
      shot.dialogue ||= []; shot.videoSegments ||= [];
      for (const line of shot.dialogue) {
        line.listenerIds = Array.isArray(line.listenerIds) ? line.listenerIds : [];
        line.delivery ||= '';
      }
      shot.characters ||= [];
      shot.storyboardStyle ||= '';
      for (const [vIndex, segment] of shot.videoSegments.entries()) {
        segment.segmentNumber = vIndex + 1; segment.timelineOrder = vIndex + 1;
        segment.durationSec = clamp(segment.durationSec, 1, 8);
      }
    }
  }
  return project;
}

function flattenShots(project) {
  return (project.scenes || []).flatMap(scene => (scene.shots || []).map(shot => ({ scene, shot })));
}

function flattenSegments(project) {
  return flattenShots(project).flatMap(({ scene, shot }) => (shot.videoSegments || []).map(segment => ({ scene, shot, segment })));
}

function flattenDialogue(project) {
  return flattenShots(project).flatMap(({ scene, shot }) => (shot.dialogue || []).map(dialogue => ({ scene, shot, dialogue })));
}

module.exports = { createEmptyProject, splitDuration, validateProject, normalizeProject, flattenShots, flattenSegments, flattenDialogue };
