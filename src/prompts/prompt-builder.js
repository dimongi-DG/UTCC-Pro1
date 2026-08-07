const NO_VISIBLE_TEXT_MARKER = 'ABSOLUTE TEXT-FREE VISUAL';
function enforceNoVisibleTextPrompt(value, kind = 'image') {
  const prompt = String(value || '').trim();
  if (prompt.includes(NO_VISIBLE_TEXT_MARKER)) return prompt;
  const scope = kind === 'video' ? 'Every frame of the video' : 'The entire generated image';
  return `${prompt}${prompt ? '. ' : ''}${NO_VISIBLE_TEXT_MARKER} — HIGHEST PRIORITY: ${scope} must contain zero visible or readable text in any language. Do not render letters, words, captions, subtitles, title cards, labels, logos, brand marks, watermarks, numbers, credits, typography, interface text, messages, signs, posters, documents, or writing-like symbols. Any phone, computer, television, document, package, clothing graphic, or sign must be blank, abstract, fully blurred, turned away, or outside the frame.`.slice(0, 9000);
}
function enforceNoVisibleTextNegative(value = '') {
  const required = 'text, letters, words, captions, subtitles, title cards, labels, logos, brand marks, watermark, numbers, credits, typography, interface text, messages, signs, posters, documents, readable screens, writing-like symbols';
  const prompt = String(value || '').trim();
  return prompt.toLowerCase().includes('readable screens') ? prompt : `${prompt}${prompt ? ', ' : ''}${required}`;
}
function characterBlock(project, shot) {
  const assigned = Array.isArray(shot.characters) ? shot.characters : [];
  return assigned.map(value => {
    const key = String(value || '').trim().toLowerCase();
    return (project.characters || []).find(c => [c.id,c.name,c.role].some(candidate => String(candidate || '').trim().toLowerCase() === key));
  }).filter(Boolean)
    .map(c => `${c.name} [${c.id}]: ${c.visualConsistencyPrompt || c.appearance}; wardrobe: ${c.wardrobe || 'consistent wardrobe'}; reference style: ${c.sheetStyle || 'Cinematic Realism'}`).join(' | ');
}
function imagePrompt(project, scene, shot) {
  const consistency = characterBlock(project, shot);
  return enforceNoVisibleTextPrompt([
    consistency || shot.description,
    `Action: ${shot.action || shot.description}; natural facial expression`,
    `Environment: ${shot.environment || scene.location}, ${scene.timeOfDay || 'daytime'}`,
    `Composition: ${shot.camera?.shotSize || 'medium shot'}, ${shot.camera?.angle || 'eye-level'}, ${shot.camera?.lens || '35mm lens'}`,
    `Lighting: ${shot.lighting || 'cinematic soft light'}; mood: ${scene.mood || project.brief.tone}`,
    `Visual style: ${project.brief.visualStyle}; aspect ratio ${project.brief.aspectRatio}`,
    'Continuity: preserve identity, face, wardrobe, props and spatial direction from adjacent shots'
  ].filter(Boolean).join('. '), 'image');
}
function videoPrompt(project, scene, shot, duration, index, total) {
  return enforceNoVisibleTextPrompt(`${duration}-second image-to-video motion instruction, segment ${index + 1} of ${total}. Use the attached Storyboard image as the mandatory first-frame reference; do not redesign it. ` +
    `Animate this action beat: ${shot.action || 'subtle natural movement'}. Camera motion: ${shot.camera?.movement || 'gentle push-in'}. ` +
    `Environment motion: subtle light and atmospheric motion. Pacing: ${scene.mood || project.brief.tone}. ` +
    `End frame: stable continuity handoff to segment ${index + 2}. Preserve the source image's character identity, wardrobe, visual medium, composition, scene geometry, lighting and screen direction.`, 'video');
}
const negativePrompt = () => enforceNoVisibleTextNegative('duplicate character, identity drift, wardrobe change, deformed hands, extra fingers, flicker, morphing');
module.exports = { NO_VISIBLE_TEXT_MARKER, enforceNoVisibleTextPrompt, enforceNoVisibleTextNegative, characterBlock, imagePrompt, videoPrompt, negativePrompt };
