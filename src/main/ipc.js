const { ipcMain, dialog, shell, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const projectStore = require('./project-store');
const settingsStore = require('./settings-store');
const assets = require('./asset-manager');
const providers = require('../services/provider-registry');
const tts = require('../services/tts-provider');
const mediaProvider = require('../services/media-provider');
const exporter = require('./export-service');
const { assertProjectPayload } = require('./validators');
const { appendDiagnostic } = require('./logging');

function root() { const value = projectStore.getActiveRoot(); if (!value) throw new Error('No active project'); return value; }
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    try { return { ok: true, data: await fn(payload, event) }; }
    catch (error) { appendDiagnostic(channel, error); return { ok: false, error: { message: error.message || 'Unknown error', code: error.code || 'error', retryable: Boolean(error.retryable), details: error.details && typeof error.details === 'object' ? error.details : undefined } }; }
  });
}
function registerIpc() {
  handle('projects:list', () => projectStore.listRecent());
  handle('projects:create', async payload => {
    const chosen = await dialog.showOpenDialog({ title: 'เลือกโฟลเดอร์เก็บโปรเจกต์', properties: ['openDirectory', 'createDirectory'] });
    if (chosen.canceled) return null;
    const settings = await settingsStore.getSettings();
    return projectStore.createProject(chosen.filePaths[0], payload?.title, settings);
  });
  handle('projects:open', async payload => {
    let selected = payload?.root;
    if (!selected) {
      const chosen = await dialog.showOpenDialog({ title: 'เปิดโฟลเดอร์โปรเจกต์', properties: ['openDirectory'] });
      if (chosen.canceled) return null; selected = chosen.filePaths[0];
    }
    return projectStore.openProject(selected);
  });
  handle('projects:save', payload => { assertProjectPayload(payload); return projectStore.saveProject(payload); });
  handle('projects:duplicate', async () => {
    const chosen = await dialog.showOpenDialog({ title: 'เลือกที่เก็บสำเนา', properties: ['openDirectory', 'createDirectory'] });
    return chosen.canceled ? null : projectStore.duplicateProject(chosen.filePaths[0]);
  });
  handle('projects:rename', payload => projectStore.renameProject(payload?.title));
  handle('projects:archive', async payload => { if (payload?.root) { await projectStore.forgetProject(payload.root); return { archived: true }; } throw new Error('Invalid project'); });
  handle('assets:import', async payload => {
    const filters = payload?.kind === 'video' ? [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }] : ['voice', 'music', 'sfx'].includes(payload?.kind) ? [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'ogg'] }] : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }];
    const chosen = await dialog.showOpenDialog({ title: 'Import media', properties: ['openFile'], filters });
    return chosen.canceled ? null : assets.importAsset(root(), chosen.filePaths[0], payload.kind);
  });
  handle('assets:remove', payload => assets.removeAsset(root(), payload?.relativePath));
  handle('assets:strip-video-audio', async payload => { const settings = await settingsStore.getSettings(); return exporter.stripProjectVideoAudio(root(), payload?.relativePath, settings.ffmpegPath); });
  handle('ai:story', payload => { assertProjectPayload(payload); return providers.generateStory(payload); });
  handle('ai:characters', payload => { assertProjectPayload(payload); return providers.generateCharacters(payload); });
  handle('ai:shot-prompt', payload => providers.generateShotPrompt(payload.project, payload.scene, payload.shot));
  handle('ai:video-segments', payload => providers.generateVideoSegments(payload.project, payload.scene, payload.shot));
  handle('ai:video-safety', payload => ({ videoPrompt: mediaProvider.safetyFrameVideoPrompt(payload?.videoPrompt, payload?.project || {}, payload?.shot || {}, { strict: Boolean(payload?.strict) }), safetyMode: payload?.strict ? 'strict' : 'standard', rewrittenAt: new Date().toISOString() }));
  handle('ai:storyboard-image', payload => { assertProjectPayload(payload?.project); return mediaProvider.generateStoryboardImage(root(), payload); });
  handle('ai:character-sheet', payload => { assertProjectPayload(payload?.project); return mediaProvider.generateCharacterSheet(root(), payload); });
  handle('ai:video', (payload, event) => { assertProjectPayload(payload?.project); return mediaProvider.generateVideo(root(), payload, (progress, status, meta = {}) => event.sender.send('ai:media-progress', { progress, status, segmentId: payload?.segment?.id, jobId: meta.jobId })); });
  handle('ai:shorten-dialogue', payload => ({ text: String(payload?.text || '').split(/\s+/).slice(0, Math.max(4, Math.floor(Number(payload?.maxWords) || 12))).join(' ') }));
  handle('tts:voices', () => tts.VOICES);
  handle('tts:synthesize', payload => tts.synthesize(root(), payload));
  handle('settings:get', () => settingsStore.getSettings());
  handle('settings:save', payload => settingsStore.saveSettings(payload || {}));
  handle('settings:save-secret', payload => settingsStore.saveSecret(payload?.provider, payload?.secret));
  handle('settings:delete-secret', payload => settingsStore.deleteSecret(payload?.provider));
  handle('settings:export', async () => {
    const chosen = await dialog.showSaveDialog({ title: 'Export Settings', defaultPath: 'clip-story-studio-settings.json', filters: [{ name: 'Clip Story Studio Settings', extensions: ['json'] }] });
    if (chosen.canceled) return null;
    const bundle = await settingsStore.exportPortableSettings(app.getVersion());
    await fs.writeFile(chosen.filePath, JSON.stringify(bundle, null, 2), 'utf8');
    return { path: chosen.filePath, containsApiKeys: false };
  });
  handle('settings:import', async () => {
    const chosen = await dialog.showOpenDialog({ title: 'Import Settings', properties: ['openFile'], filters: [{ name: 'Clip Story Studio Settings', extensions: ['json'] }] });
    if (chosen.canceled) return null;
    const stat = await fs.stat(chosen.filePaths[0]);
    if (stat.size > 2_000_000) throw new Error('Settings file is too large');
    const bundle = JSON.parse(await fs.readFile(chosen.filePaths[0], 'utf8'));
    const settings = await settingsStore.importPortableSettings(bundle);
    return { settings, path: chosen.filePaths[0], apiKeysImported: false };
  });
  handle('settings:test-provider', payload => providers.testConnection(payload?.provider));
  handle('settings:test-ffmpeg', async () => { const settings = await settingsStore.getSettings(); return exporter.testFfmpeg(settings.ffmpegPath); });
  handle('settings:open-logs', () => shell.openPath(path.join(app.getPath('userData'), 'logs')));
  handle('export:checklist', payload => exporter.checklist(root(), payload));
  handle('export:package', payload => exporter.exportPackage(root(), payload));
  handle('export:character-prompt', payload => { assertProjectPayload(payload?.project); return exporter.exportExternalCharacterPrompt(root(), payload.project, payload.promptTemplates); });
  handle('export:storyboard-prompt', payload => { assertProjectPayload(payload?.project); return exporter.exportExternalStoryboardPrompt(root(), payload.project, payload.promptTemplates); });
  handle('export:mp4', async (payload, event) => {
    const chosen = await dialog.showSaveDialog({ title: 'Export Final MP4', defaultPath: `${payload.project.title}.mp4`, filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] });
    if (chosen.canceled) return null;
    const settings = await settingsStore.getSettings();
    return exporter.exportMp4(root(), payload.project, chosen.filePath, { ...payload.options, ffmpegPath: settings.ffmpegPath }, progress => event.sender.send('export:progress', { progress }));
  });
  handle('export:cancel', () => ({ cancelled: exporter.cancelExport() }));
}
module.exports = { registerIpc, getActiveProjectRoot: projectStore.getActiveRoot };
