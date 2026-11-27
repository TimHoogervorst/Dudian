import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.ts';
import { finishChapter,completionFor } from '../src/completion.ts';
import { history,openStory } from '../src/history.ts';
import { recordedStrengths } from '../src/strength.ts';
import { latestGeneration } from '../src/generation-job.ts';

test('hiding finished and in-progress stories preserves learning and removes dashboard suggestions',async t=>{
  const store=await testStore();
  const server=await createApp(store.db.pool);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  await store.saveStory({...await store.story('tea-shop'),id:'reading'});
  await openStory(store,'reading');await store.move('reading',1,1);
  await finishChapter(store,'tea-shop',0);await finishChapter(store,'tea-shop',1);
  const before=await recordedStrengths(store.db);
  await store.db.prepare("INSERT INTO generation_job(id,stage,\"storyId\") VALUES(1,'ready','reading')").run();
  for(const id of ['tea-shop','reading','reading']){
    assert.equal((await store.fetch(base+'/api/stories/'+id+'/hide',{method:'POST'})).status,200);
  }
  assert.deepEqual(await history(store),{current:null,stories:[]});
  assert.equal(await latestGeneration(store),null);
  assert.deepEqual(await store.stories(),[]);
  assert.deepEqual(await recordedStrengths(store.db),before);
  assert.equal((await completionFor(store,'tea-shop')).finished,true);
  assert.deepEqual(await store.position('reading'),{chapter:1,paragraph:1});
});
