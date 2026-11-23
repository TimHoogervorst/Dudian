import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {readCoverResult} from '../scripts/cover-result.mjs';

test('collects a late Codex cover only after the PNG finishes writing',async t=>{
  const root=await mkdtemp(join(tmpdir(),'dudian-cover-result-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const directory=join(root,'thread');
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=','base64');
  const result=readCoverResult(directory,{waitMs:2000,pollMs:5});
  await wait(15);
  await mkdir(directory);
  const path=join(directory,'cover.PNG');
  await writeFile(path,bytes.subarray(0,32));
  await wait(25);
  await writeFile(path,bytes);
  assert.deepEqual(await result,bytes);
  await assert.rejects(readCoverResult(join(root,'another-thread'),{waitMs:15,pollMs:5}),/without saving a complete illustration/);
});
