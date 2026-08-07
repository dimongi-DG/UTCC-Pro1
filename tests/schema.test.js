const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyProject, splitDuration, validateProject, normalizeProject } = require('../src/shared/schema');

test('project schema creates stable offline project shape', () => {
  const project = createEmptyProject('ทดสอบ');
  assert.equal(project.title, 'ทดสอบ');
  assert.equal(project.schemaVersion, 1);
  assert.equal(project.brief.characterStyle, 'Cinematic Realism');
  assert.deepEqual(project.workflowSync.stale,{characters:false,story:false,storyboard:false,video:false,voice:false,timeline:false});
  assert.deepEqual(validateProject(project), []);
});
test('long storyboard duration splits into unlimited <= 8 second segments', () => {
  assert.deepEqual(splitDuration(20), [8, 8, 4]);
  assert.equal(splitDuration(81).reduce((a,b)=>a+b,0), 81);
  assert.ok(splitDuration(81).every(value => value > 0 && value <= 8));
});
test('normalizer restores order without losing segment content', () => {
  const project=createEmptyProject('x');
  project.scenes=[{sceneNumber:9,shots:[{shotNumber:8,plannedDurationSec:20,dialogue:[],videoSegments:[{segmentNumber:7,durationSec:12,actionBeat:'keep'}]}]}];
  normalizeProject(project);
  assert.equal(project.scenes[0].sceneNumber,1);assert.equal(project.scenes[0].shots[0].shotNumber,1);
  assert.equal(project.scenes[0].shots[0].videoSegments[0].durationSec,8);
  assert.equal(project.scenes[0].shots[0].videoSegments[0].actionBeat,'keep');
});
