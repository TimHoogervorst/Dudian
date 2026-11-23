import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {finishChapter} from '../src/completion.ts';
import {recordInterval} from '../src/activity.ts';
import {buildPlan} from '../src/story-plan.ts';

test('story length adapts after three measured chapters while vocabulary difficulty stays fixed',()=>{
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
      if(i===1)assert.equal(buildPlan(store,'easy',10).targetWords,160);
    }
    return store;
  }
  const faster=history(60),slower=history(120);
  try {
    assert.equal(buildPlan(faster,'easy',10).targetWords,240);
    assert.equal(buildPlan(slower,'easy',10).targetWords,120);
    assert.equal(buildPlan(slower,'easy',30).targetWords,360);
    assert.equal(buildPlan(slower,'easy',30).ceiling,buildPlan(slower,'easy',10).ceiling);
  } finally {faster.db.close();slower.db.close();}
});
