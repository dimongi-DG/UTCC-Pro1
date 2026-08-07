const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { writeAtomic, readWithBackup } = require('../src/main/atomic-file');

test('atomic save keeps rotating backup and restores corrupt primary', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'clip-story-'));const file=path.join(dir,'project.json');
  await writeAtomic(file,{version:1});await writeAtomic(file,{version:2});await writeAtomic(file,{version:3});
  assert.equal(JSON.parse(await fs.readFile(`${file}.bak1`,'utf8')).version,2);
  await fs.writeFile(file,'{broken');
  assert.equal((await readWithBackup(file)).version,2);
  await fs.rm(dir,{recursive:true,force:true});
});
