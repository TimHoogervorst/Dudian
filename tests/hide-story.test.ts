import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {ReadingStore} from '../src/store.ts';
import {createApp} from '../src/server.ts';
import {finishChapter,completionFor} from '../src/completion.ts';
import {history,openStory} from '../src/history.ts';
import {recordedStrengths} from '../src/strength.ts';
import {latestGeneration} from '../src/generation-job.ts';

test('hiding finished and in-progress stories preserves learning and removes dashboard suggestions',async t=>{
  const store=new ReadingStore();
  const server=await createApp(store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));store.db.close();});
  const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
  store.saveStory({...store.story('tea-shop'),id:'reading'});
  openStory(store,'reading');store.move('reading',1,1);
  finishChapter(store,'tea-shop',0);finishChapter(store,'tea-shop',1);
  const before=recordedStrengths(store.db);
  store.db.prepare("INSERT INTO generation_job(id,stage,storyId) VALUES(1,'ready','reading')").run();
  for(const id of ['tea-shop','reading','reading']){
    assert.equal((await fetch(base+'/api/stories/'+id+'/hide',{method:'POST'})).status,200);
  }
  assert.deepEqual(history(store),{current:null,stories:[]});
  assert.equal(latestGeneration(store),null);
  assert.deepEqual(store.stories(),[]);
  assert.deepEqual(recordedStrengths(store.db),before);
  assert.equal(completionFor(store,'tea-shop').finished,true);
  assert.deepEqual(store.position('reading'),{chapter:1,paragraph:1});
});
