const { id } = require('../shared/utils');
const { splitDuration } = require('../shared/schema');
const prompts = require('../prompts/prompt-builder');

function shot(sceneNumber, shotNumber, duration, brief, purpose, characters = []) {
  return {
    id: id('shot'), shotNumber, plannedDurationSec: duration, description: purpose,
    purpose, characters: characters.map(character => character.id), dialogue: [{ id: id('line'), speakerId: characters[0]?.id || 'narrator', text: purpose, emotion: 'จริงใจ', pace: 1, startSec: 0, estimatedDurationSec: Math.max(2, duration - 1), audioRelativePath: '' }],
    camera: { shotSize: shotNumber === 1 ? 'Wide shot' : 'Medium close-up', angle: 'Eye-level', movement: 'Slow push-in', lens: '35mm' },
    action: purpose, environment: brief.concept || 'a meaningful everyday setting', lighting: 'soft cinematic light',
    imagePrompt: '', imageNegativePrompt: prompts.negativePrompt(), storyboardImageRelativePath: '', videoSegments: [], status: 'draft', locked: false
  };
}
function generateStory(project) {
  const b = project.brief;
  const total = Math.max(12, Number(b.targetDurationSec) || 30);
  const durations = [Math.round(total * .25), Math.round(total * .45), total - Math.round(total * .25) - Math.round(total * .45)];
  const beats = [
    `เปิดด้วยคำถามที่สะท้อนปัญหาของ ${b.targetAudience || 'ผู้ชม'}`,
    `เล่าแนวคิด ${b.concept || 'เรื่องราวสำคัญ'} ผ่านเหตุการณ์ที่เห็นภาพชัด`,
    `สรุปข้อความ “${b.keyMessage || 'การเปลี่ยนแปลงเริ่มจากก้าวเล็ก ๆ'}” และชวนผู้ชมลงมือทำ`
  ];
  const scenes = beats.map((beat, i) => ({
    id: id('scene'), sceneNumber: i + 1, title: ['Hook', 'Discovery', 'Resolution'][i], purpose: beat,
    location: i === 1 ? 'สถานที่หลักของเรื่อง' : 'พื้นที่เรียบง่ายที่สื่ออารมณ์', timeOfDay: i === 2 ? 'golden hour' : 'day',
    mood: [b.tone, 'curious and hopeful', 'uplifting'][i], locked: false, shots: [shot(i + 1, 1, durations[i], b, beat, project.characters || [])]
  }));
  for (const scene of scenes) for (const item of scene.shots) Object.assign(item, buildShotPrompt(project, scene, item));
  return {
    story: { title: project.title, hook: beats[0], logline: `${b.concept || 'เรื่องราวหนึ่ง'} ที่ทำให้ผู้ชมเห็นว่า ${b.keyMessage || 'ทุกก้าวมีความหมาย'}`, synopsis: beats.join(' — '), ending: beats[2], callToAction: b.callToAction || 'บันทึกและแชร์เรื่องนี้ให้คนที่คุณนึกถึง' },
    scenes
  };
}
function buildShotPrompt(project, scene, shot) {
  return { imagePrompt: prompts.imagePrompt(project, scene, shot), imageNegativePrompt: prompts.negativePrompt() };
}
function buildSegments(project, scene, shot) {
  const durations = splitDuration(shot.plannedDurationSec);
  return durations.map((duration, index) => ({
    id: id('segment'), segmentNumber: index + 1, durationSec: duration, timelineOrder: index + 1,
    startFrame: index === 0 ? shot.description : `Continue exactly from segment ${index} ending frame`,
    endFrame: index === durations.length - 1 ? 'Hold a clean final composition' : `Continuity handoff into segment ${index + 2}`,
    actionBeat: `${shot.action || shot.description} — beat ${index + 1}`,
    videoPrompt: prompts.videoPrompt(project, scene, shot, duration, index, durations.length),
    videoNegativePrompt: prompts.negativePrompt(), transitionIn: index ? 'cut' : 'none', transitionOut: 'cut',
    videoClipRelativePath: '', trimStartSec: 0, trimEndSec: 0, volume: 1, status: 'prompt-ready', generationMeta: { provider: 'mock', model: 'mock-motion-v1', promptVersion: 1, generatedAt: new Date().toISOString() }
  }));
}
function generateCharacters(project) {
  const concept = `${project.brief?.concept || ''} ${project.story?.synopsis || ''}`;
  const voiceFraud = /voice|เสียง|แม่|มิจฉาชีพ|หลอก/i.test(concept);
  const presets = voiceFraud ? [
    { name: 'เมย์', role: 'ตัวเอก / ลูกสาว', ageRange: '28–35 ปี', appearance: 'หญิงไทยวัยทำงาน ใบหน้าจริงใจ ดวงตาแสดงความกังวล ผมดำประบ่า', wardrobe: 'เสื้อทำงานโทนครีมเรียบง่าย นาฬิกาข้อมือ กระเป๋าสะพาย', personality: 'รับผิดชอบ รักครอบครัว มีสติแต่ถูกกดดันด้วยความห่วงใย', speakingStyle: 'สุภาพ เป็นธรรมชาติ พูดเร็วขึ้นเมื่อวิตกกังวล' },
    { name: 'แม่อรุณ', role: 'แม่ / บุคคลที่ถูกโคลนเสียง', ageRange: '58–65 ปี', appearance: 'หญิงไทยสูงวัย ใบหน้าอบอุ่น รอยยิ้มอ่อนโยน ผมสั้นมีสีเทาแซม', wardrobe: 'เสื้อผ้าฝ้ายสีอบอุ่น ลายเรียบ สวมแว่นอ่านหนังสือ', personality: 'อ่อนโยน ห่วงลูก ประหยัด และเป็นที่พึ่งของครอบครัว', speakingStyle: 'นุ่มนวล ใช้คำคุ้นเคยในครอบครัว มีจังหวะหายใจเฉพาะตัว' },
    { name: 'ผู้ควบคุมเสียง', role: 'มิจฉาชีพ / Antagonist', ageRange: '30–45 ปี', appearance: 'บุคคลไม่เปิดเผยตัวตน เห็นใบหน้าบางส่วนจากแสงจอสีฟ้าและคลื่นเสียงสะท้อนบนแว่น', wardrobe: 'เสื้อฮู้ดสีเข้ม ไม่มีโลโก้หรือสัญลักษณ์เฉพาะ', personality: 'เยือกเย็น เป็นระบบ ใช้แรงกดดันทางเวลาเป็นเครื่องมือ', speakingStyle: 'พูดสั้น กระชับ ควบคุมอารมณ์และจังหวะของเสียงปลอม' }
  ] : [
    { name: 'ตัวเอก', role: 'Protagonist', ageRange: '25–40 ปี', appearance: 'บุคลิกเข้าถึงง่าย ใบหน้าแสดงอารมณ์ชัดเจนและจดจำง่าย', wardrobe: 'เสื้อผ้าร่วมสมัยที่เข้ากับบริบทของเรื่อง', personality: 'มีเป้าหมายชัดเจน เห็นอกเห็นใจผู้อื่น และเปลี่ยนแปลงจากเหตุการณ์', speakingStyle: 'เป็นธรรมชาติ กระชับ และสอดคล้องกับกลุ่มเป้าหมาย' },
    { name: 'ผู้สนับสนุน', role: 'Supporting Character', ageRange: '30–55 ปี', appearance: 'รูปลักษณ์แตกต่างจากตัวเอกอย่างชัดเจนแต่กลมกลืนในโลกเดียวกัน', wardrobe: 'โทนสีสนับสนุน palette หลักของเรื่อง', personality: 'ช่วยสะท้อนประเด็นและผลักดันการตัดสินใจของตัวเอก', speakingStyle: 'อบอุ่น ชัดเจน และมีจังหวะเฉพาะตัว' }
  ];
  return presets.map(character => {
    const ageYears = Number(character.ageRange.match(/\d+/)?.[0]) || 30;
    const gender = /หญิง|แม่|ลูกสาว|female|woman/i.test(`${character.name} ${character.role} ${character.appearance}`) ? 'หญิง' : /ชาย|male|man/i.test(`${character.role} ${character.appearance}`) ? 'ชาย' : 'ไม่ระบุ';
    const lifeStage = ageYears < 13 ? 'เด็ก' : ageYears < 20 ? 'วัยรุ่น' : ageYears < 40 ? 'วัยทำงาน' : ageYears < 60 ? 'วัยกลางคน' : 'ผู้สูงอายุ';
    return { ...character, id: id('character'), gender, lifeStage, ageYears, voiceProfile: { genderPresentation: gender, ageImpression: lifeStage, tone: character.speakingStyle, pace: 'เป็นธรรมชาติ', accent: 'ไทยมาตรฐาน' }, visualConsistencyPrompt: `${character.name}, ${character.appearance}, ${character.wardrobe}, ${project.brief?.characterStyle || 'Cinematic Realism'}, consistent gender, face, apparent age, hairstyle and clothing across every shot`, negativePrompt: 'identity drift, face change, age change, wardrobe change, duplicate character, deformed anatomy', sheetStyle: project.brief?.characterStyle || 'Cinematic Realism', referenceImages: [], voiceId: '' };
  });
}
module.exports = { generateStory, generateCharacters, buildShotPrompt, buildSegments };
