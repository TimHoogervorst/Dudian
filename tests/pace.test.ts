import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishChapter } from '../src/completion.ts';
import { recordInterval } from '../src/activity.ts';
import { targetWordCount } from '../src/pace.ts';

test('historical pace estimate uses completed, timed chapters',async ()=>{
  async function history(seconds:number) {
    const store=await testStore();
    for(let i=0;i<3;i++) {
      const story={id:'measured-'+i,title:'Tea',chapters:[{title:'Tea',paragraphs:[Array.from({length:24},()=>({text:'茶'}))]}]};
      await store.saveStory(story);
      const start=Date.UTC(2026,10,16+i);
      for(let j=0;j<seconds;j+=30)await recordInterval(store,story.id,0,30000,start+(j+30)*1000);
      // A gap before pressing Finish chapter is idle. Rereading afterward is outside the sample.
      await finishChapter(store,story.id,0,start+3600000);
      await recordInterval(store,story.id,0,30000,start+3700000);
      if(i===1)assert.equal(await targetWordCount(store,10),160);
    }
    return store;
  }
  const faster=await history(60),slower=await history(120);
  assert.equal(await targetWordCount(faster,10),240);
  assert.equal(await targetWordCount(slower,10),120);
  assert.equal(await targetWordCount(slower,30),360);
});
