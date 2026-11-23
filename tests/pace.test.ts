import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {finishChapter} from '../src/completion.ts';
import {recordInterval} from '../src/activity.ts';
import {targetWordCount} from '../src/pace.ts';

test('historical pace estimate uses completed, timed chapters',()=>{
  function history(seconds:number) {
    const store=new ReadingStore();
    for(let i=0;i<3;i++) {
      const story={id:'measured-'+i,title:'Tea',chapters:[{title:'Tea',paragraphs:[Array.from({length:24},()=>({text:'茶'}))]}]};
      store.saveStory(story);
      const start=Date.UTC(2026,10,16+i);
      for(let j=0;j<seconds;j+=30)recordInterval(store,story.id,0,30000,start+(j+30)*1000);
      // A gap before pressing Finish chapter is idle. Rereading afterward is outside the sample.
      finishChapter(store,story.id,0,start+3600000);
      recordInterval(store,story.id,0,30000,start+3700000);
      if(i===1)assert.equal(targetWordCount(store,10),160);
    }
    return store;
  }
  const faster=history(60),slower=history(120);
  try {
    assert.equal(targetWordCount(faster,10),240);
    assert.equal(targetWordCount(slower,10),120);
    assert.equal(targetWordCount(slower,30),360);
  } finally {faster.db.close();slower.db.close();}
});
