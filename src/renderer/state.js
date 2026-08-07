export const state = {
  project: null, route: 'projects', recents: [], settings: null,
  saveStatus: 'พร้อม', busy: '', busyAction: '', pendingAction: '', error: '', undo: null, exportProgress: 0, mediaProgress: 0
};

let saveTimer;
export function setProject(project) { state.project = project; }
export function touch() {
  if (!state.project) return;
  state.project.updatedAt = new Date().toISOString();
  state.saveStatus = 'กำลังรอบันทึก…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, state.settings?.autosaveIntervalMs || 1200);
}
export async function saveNow() {
  if (!state.project) return;
  clearTimeout(saveTimer); state.saveStatus = 'กำลังบันทึก…';
  const result = await window.studio.projects.save(state.project);
  if (!result.ok) { state.saveStatus = 'บันทึกไม่สำเร็จ'; state.error = result.error.message; window.dispatchEvent(new Event('studio:render')); return false; }
  state.project.updatedAt = result.data.updatedAt; state.saveStatus = 'บันทึกแล้ว';
  window.dispatchEvent(new Event('studio:status')); return true;
}
export function rememberUndo(label, callback) { state.undo = { label, callback }; setTimeout(() => { if (state.undo?.callback === callback) state.undo = null; }, 8000); }
