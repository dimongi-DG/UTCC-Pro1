const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('studio', Object.freeze({
  projects: Object.freeze({
    list: invoke('projects:list'),
    create: invoke('projects:create'),
    open: invoke('projects:open'),
    save: invoke('projects:save'),
    duplicate: invoke('projects:duplicate'),
    rename: invoke('projects:rename'),
    archive: invoke('projects:archive')
  }),
  assets: Object.freeze({
    import: invoke('assets:import'),
    remove: invoke('assets:remove'),
    stripVideoAudio: invoke('assets:strip-video-audio')
  }),
  ai: Object.freeze({
    generateStory: invoke('ai:story'),
    generateCharacters: invoke('ai:characters'),
    generateShotPrompt: invoke('ai:shot-prompt'),
    generateVideoSegments: invoke('ai:video-segments'),
    makeVideoPromptSafe: invoke('ai:video-safety'),
    generateStoryboardImage: invoke('ai:storyboard-image'),
    generateCharacterSheet: invoke('ai:character-sheet'),
    generateVideo: invoke('ai:video'),
    shortenDialogue: invoke('ai:shorten-dialogue')
  }),
  tts: Object.freeze({
    voices: invoke('tts:voices'),
    synthesize: invoke('tts:synthesize')
  }),
  settings: Object.freeze({
    get: invoke('settings:get'),
    save: invoke('settings:save'),
    saveSecret: invoke('settings:save-secret'),
    deleteSecret: invoke('settings:delete-secret'),
    export: invoke('settings:export'),
    import: invoke('settings:import'),
    testProvider: invoke('settings:test-provider'),
    testFfmpeg: invoke('settings:test-ffmpeg'),
    openLogs: invoke('settings:open-logs')
  }),
  exports: Object.freeze({
    checklist: invoke('export:checklist'),
    package: invoke('export:package'),
    characterPrompt: invoke('export:character-prompt'),
    storyboardPrompt: invoke('export:storyboard-prompt'),
    mp4: invoke('export:mp4'),
    cancel: invoke('export:cancel')
  }),
  onExportProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },
  onMediaProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('ai:media-progress', listener);
    return () => ipcRenderer.removeListener('ai:media-progress', listener);
  }
}));
