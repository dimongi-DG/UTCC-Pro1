const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');
const { PROJECT_DIRS } = require('../shared/constants');
const { createEmptyProject, normalizeProject, validateProject } = require('../shared/schema');
const { sanitizeFilename } = require('./validators');
const { writeAtomic, readWithBackup } = require('./atomic-file');

let activeRoot = null;
const registryPath = () => path.join(app.getPath('userData'), 'recent-projects.json');

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}
async function readRegistry() {
  try { return await readJson(registryPath()); } catch { return []; }
}
async function updateRegistry(root, project) {
  const list = (await readRegistry()).filter(item => item.root !== root);
  list.unshift({ root, id: project.id, title: project.title, updatedAt: project.updatedAt, aspectRatio: project.brief.aspectRatio, targetDurationSec: project.brief.targetDurationSec });
  await writeAtomic(registryPath(), list.slice(0, 24), false);
}
async function listRecent() {
  const list = await readRegistry();
  const valid = list.filter(item => fs.existsSync(path.join(item.root, 'project.json')));
  if (valid.length !== list.length) await writeAtomic(registryPath(), valid, false);
  return valid;
}
async function createProject(parentDir, title, defaults) {
  const base = sanitizeFilename(title || 'โปรเจกต์ใหม่');
  let root = path.join(parentDir, base);
  let index = 2;
  while (fs.existsSync(root)) root = path.join(parentDir, `${base}-${index++}`);
  await fsp.mkdir(root, { recursive: false });
  await Promise.all(PROJECT_DIRS.map(dir => fsp.mkdir(path.join(root, dir), { recursive: true })));
  const project = createEmptyProject(title || base, defaults);
  await writeAtomic(path.join(root, 'project.json'), project, false);
  activeRoot = root;
  await updateRegistry(root, project);
  return project;
}
async function openProject(root) {
  const file = path.join(root, 'project.json');
  const project = await readWithBackup(file);
  const errors = validateProject(project);
  if (errors.length) throw new Error(`Project validation failed: ${errors.join('; ')}`);
  activeRoot = root;
  normalizeProject(project);
  await updateRegistry(root, project);
  return project;
}
async function saveProject(project) {
  if (!activeRoot) throw new Error('No active project');
  normalizeProject(project);
  const errors = validateProject(project);
  if (errors.length) throw new Error(errors.join('; '));
  await writeAtomic(path.join(activeRoot, 'project.json'), project, true);
  await updateRegistry(activeRoot, project);
  return { updatedAt: project.updatedAt };
}
async function duplicateProject(destinationParent) {
  if (!activeRoot) throw new Error('No active project');
  const project = await readJson(path.join(activeRoot, 'project.json'));
  const name = `${sanitizeFilename(project.title)}-copy-${Date.now()}`;
  const target = path.join(destinationParent, name);
  await fsp.cp(activeRoot, target, { recursive: true, errorOnExist: true });
  const copy = await readJson(path.join(target, 'project.json'));
  copy.id = require('../shared/utils').id('project');
  copy.title = `${project.title} (สำเนา)`;
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  await writeAtomic(path.join(target, 'project.json'), copy, false);
  activeRoot = target;
  await updateRegistry(target, copy);
  return copy;
}
async function renameProject(title) {
  if (!activeRoot) throw new Error('No active project');
  const project = await readJson(path.join(activeRoot, 'project.json'));
  project.title = String(title || '').trim() || project.title;
  return saveProject(project);
}
async function forgetProject(root) {
  const list = (await readRegistry()).filter(item => item.root !== root);
  await writeAtomic(registryPath(), list, false);
  if (activeRoot === root) activeRoot = null;
}
const getActiveRoot = () => activeRoot;
module.exports = { listRecent, createProject, openProject, saveProject, duplicateProject, renameProject, forgetProject, getActiveRoot, writeAtomic };
