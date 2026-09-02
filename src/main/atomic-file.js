const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

async function writeAtomic(file, value, backups = true) {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fsp.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
    if (backups && fs.existsSync(file)) {
      for (let i = 3; i >= 2; i--) {
        const older = `${file}.bak${i - 1}`;
        if (fs.existsSync(older)) await fsp.copyFile(older, `${file}.bak${i}`).catch(() => {});
      }
      await fsp.copyFile(file, `${file}.bak1`).catch(() => {});
    }
    try {
      await fsp.rename(temp, file);
    } catch (err) {
      if (['EXDEV', 'EPERM', 'EBUSY'].includes(err.code)) {
        await fsp.copyFile(temp, file);
        await fsp.unlink(temp).catch(() => {});
      } else {
        throw err;
      }
    }
  } catch (error) {
    await fsp.unlink(temp).catch(() => {});
    throw error;
  }
}
async function readWithBackup(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch (originalError) {
    for (let i = 1; i <= 3; i++) {
      try { return JSON.parse(await fsp.readFile(`${file}.bak${i}`, 'utf8')); } catch { /* next */ }
    }
    throw originalError;
  }
}
module.exports = { writeAtomic, readWithBackup };
