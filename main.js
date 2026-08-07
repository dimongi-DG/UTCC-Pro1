const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, protocol, net } = require('electron');
const { registerIpc, getActiveProjectRoot } = require('./src/main/ipc');
const { appendDiagnostic } = require('./src/main/logging');
const exporter = require('./src/main/export-service');

protocol.registerSchemesAsPrivileged([{
  scheme: 'clip-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

function createWindow() {
  const smokeTest = process.argv.includes('--smoke-test');
  const win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#0b0d12',
    title: 'Clip Story Studio',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true
    }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!smokeTest) win.show(); });
  if (smokeTest) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const result = await win.webContents.executeJavaScript(`(async () => {
            location.hash = '#/settings';
            await new Promise(resolve => setTimeout(resolve, 250));
            const firstInput = document.querySelector('input');
            const result={ shell: Boolean(document.querySelector('.shell')), title: document.title, settings: document.body.innerText.includes('OpenRouter') && document.body.innerText.includes('Qwen / Alibaba Model Studio'), compactInputs: firstInput ? getComputedStyle(firstInput).fontSize === '13px' : false, timeoutSetting: Boolean(document.querySelector('[data-path="settings.requestTimeoutSec"]')), workflowRouting: Boolean(document.querySelector('[data-path="settings.models.story"]') && document.querySelector('[data-path="settings.reasoning.story"]') && document.querySelector('[data-path="settings.endpoints.openaiTts"]')), mediaRouting: Boolean(document.querySelector('[data-path="settings.models.image"]') && document.querySelector('[data-path="settings.models.videoGeneration"]') && document.querySelector('[data-path="settings.endpoints.openaiImage"]') && document.querySelector('[data-path="settings.endpoints.openaiImageEdit"]') && document.querySelector('[data-path="settings.endpoints.openaiVideo"]') && window.studio.ai.generateCharacterSheet && window.studio.ai.generateStoryboardImage && window.studio.ai.generateVideo && window.studio.ai.makeVideoPromptSafe && window.studio.assets.stripVideoAudio), settingsTransfer: Boolean(document.querySelector('[data-action="export-settings"]') && document.querySelector('[data-action="import-settings"]') && document.querySelector('[data-action="apply-openai-routing"]')), promptTemplates: Boolean(document.querySelector('[data-path="settings.promptTemplates.story.system"]') && document.querySelector('[data-path="settings.promptTemplates.story.user"]') && document.querySelector('[data-path="settings.promptTemplates.characters.system"]') && document.querySelector('[data-path="settings.promptTemplates.storyboard.user"]') && document.querySelector('[data-path="settings.promptTemplates.video.user"]') && document.querySelector('[data-action="reset-all-prompt-templates"]') && document.querySelector('.variable-guide')) };
            const stateModule=await import('./state.js');
            stateModule.setProject({id:'smoke-project',title:'Smoke',brief:{aspectRatio:'16:9',targetDurationSec:8,language:'ไทย',characterStyle:'3D Cartoon',storyboardStyle:'Cinematic Color'},story:{title:'Smoke',hook:'',logline:'',synopsis:'',ending:''},characters:[{id:'c1',name:'เมย์',role:'ตัวเอก',appearance:'หญิงไทย',wardrobe:'เสื้อครีม',personality:'มีสติ',speakingStyle:'',visualConsistencyPrompt:'consistent identity',negativePrompt:'identity drift',sheetStyle:'3D Cartoon',referenceImages:[{id:'r1',relativePath:'characters/smoke.png',isPrimary:true}]}],scenes:[{id:'s1',sceneNumber:1,title:'Scene',purpose:'Purpose',location:'Home',timeOfDay:'day',mood:'tense',locked:false,shots:[{id:'sh1',shotNumber:1,plannedDurationSec:8,description:'Description',purpose:'Purpose',characters:['c1'],dialogue:[],camera:{shotSize:'Medium shot',angle:'Eye-level',movement:'Static',lens:'35mm'},action:'Action',environment:'Home',lighting:'soft',imagePrompt:'ready prompt',imageNegativePrompt:'',storyboardStyle:'Cinematic Color',storyboardImageRelativePath:'',videoSegments:[{id:'v1',segmentNumber:1,timelineOrder:1,durationSec:8,videoPrompt:'video prompt',videoNegativePrompt:'',startFrame:'',endFrame:'',actionBeat:'',videoClipRelativePath:'',status:'blocked',generationError:{title:'Sora ปฏิเสธ Prompt ด้วยระบบความปลอดภัย',message:'blocked by moderation',hints:['edit prompt']}}],status:'prompt-ready',locked:false}]}],voiceAssignments:{narrator:'th-female-warm'},timeline:{fitMode:'crop',musicRelativePath:'',musicVolume:.25,sfx:[]}});
            location.hash='#/brief';await new Promise(resolve=>setTimeout(resolve,100));const tone=document.querySelector('[data-path="brief.tone"]');tone.value='updated tone';tone.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,50));result.briefSync=Boolean(document.body.innerText.includes('Brief revision 1')&&document.querySelector('.stale-dot'));
            location.hash='#/characters';await new Promise(resolve=>setTimeout(resolve,100));const styleInput=document.querySelector('[data-path="characters.0.sheetStyle"]');result.characterSheetUI=Boolean(document.querySelector('[data-action="generate-character-sheet"]')&&document.querySelector('[data-action="export-external-character-prompt"]')&&window.studio.exports.characterPrompt&&styleInput&&styleInput.tagName==='INPUT'&&styleInput.getAttribute('list')==='character-style-presets'&&document.querySelector('[data-path="brief.characterStyle"]')&&document.querySelector('[data-action="accept-characters"]'));
            location.hash='#/story';await new Promise(resolve=>setTimeout(resolve,100));result.storyPromptStatus=document.body.innerText.includes('Prompt 1/1')&&document.body.innerText.includes('Storyboard 0/1')&&Boolean(document.querySelector('[data-action="generate-storyboard-image"]')&&document.querySelector('[data-action="export-external-storyboard-prompt"]')&&window.studio.exports.storyboardPrompt&&document.querySelector('[data-action="toggle-shot-character"].selected')&&document.querySelector('[data-path="scenes.0.shots.0.storyboardStyle"]'));
            location.hash='#/storyboard';await new Promise(resolve=>setTimeout(resolve,100));const frame=document.createElement('div');frame.className='media-frame video-preview';const video=document.createElement('video');frame.append(video);document.body.append(frame);const bounds=frame.getBoundingClientRect();result.videoContain=getComputedStyle(video).objectFit==='contain'&&bounds.width<=641&&bounds.height<=361;frame.remove();const segmentButton=document.querySelector('[data-action="generate-segments"]');result.storyboardMediaUI=Boolean(document.querySelector('[data-action="generate-storyboard-image"]')&&document.querySelector('[data-action="generate-video"]')&&document.querySelector('[data-action="generate-all-image-to-video"]')&&document.querySelector('[data-action="make-video-prompt-safe"]')&&document.querySelector('.inline-error')&&document.querySelector('[data-path="scenes.0.shots.0.storyboardStyle"]')&&segmentButton?.disabled&&document.body.innerText.includes('Image-to-Video'));
            const safety=await window.studio.ai.makeVideoPromptSafe({videoPrompt:'A deepfake scam asks for OTP',project:stateModule.state.project,shot:stateModule.state.project.scenes[0].shots[0]});result.videoSafety=Boolean(safety.ok&&safety.data.videoPrompt.includes('PUBLIC-SERVICE SAFETY DRAMATIZATION')&&!/deepfake|scam|OTP/i.test(safety.data.videoPrompt));
            return result;
          })()`);
          const ffmpeg = await exporter.testFfmpeg('');
          result.ffmpeg = Boolean(ffmpeg.ok && /ffmpeg version/i.test(ffmpeg.message));
          if (!result.shell || result.title !== 'Clip Story Studio' || !result.settings || !result.compactInputs || !result.timeoutSetting || !result.workflowRouting || !result.mediaRouting || !result.settingsTransfer || !result.promptTemplates || !result.briefSync || !result.characterSheetUI || !result.storyPromptStatus || !result.storyboardMediaUI || !result.videoContain || !result.videoSafety || !result.ffmpeg) throw new Error('Renderer, Prompt Template Registry, Brief dependency sync, AI/media routing, Character-first Story/Storyboard UI, video fit, Sora safety framing, bundled FFmpeg, or settings transfer did not initialize');
          console.log('SMOKE_OK', JSON.stringify(result));
          app.exit(0);
        } catch (error) {
          console.error('SMOKE_FAILED', error.message);
          app.exit(1);
        }
      }, 1200);
    });
    win.webContents.once('did-fail-load', (_event, code, description) => {
      console.error('SMOKE_FAILED', code, description);
      app.exit(1);
    });
  }
  return win;
}

app.whenReady().then(async () => {
  registerIpc();
  protocol.handle('clip-asset', async (request) => {
    try {
      const root = getActiveProjectRoot();
      if (!root) return new Response('No active project', { status: 404 });
      const url = new URL(request.url);
      const relative = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
      const full = path.resolve(root, relative);
      const rootWithSep = path.resolve(root) + path.sep;
      if (!full.startsWith(rootWithSep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(full).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => appendDiagnostic('startup', error));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => appendDiagnostic('uncaught', error));
process.on('unhandledRejection', (error) => appendDiagnostic('rejection', error));
