import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {finishChapter} from '../src/completion.ts';
import {recordAction} from '../src/word-actions.ts';
import {recordInterval,markAdvance,readingWeek} from '../src/activity.ts';

test('one active minute qualifies and overlapping device intervals count once',()=>{
  const store=new ReadingStore();
  const start=Date.parse('2026-11-23T11:00:00Z');
  try{
    recordInterval(store,'tea-shop',0,30000,start+30000);
    recordInterval(store,'tea-shop',0,30000,start+45000);
    assert.equal(readingWeek(store,start+45000,'UTC').days[0].state,'empty');
    recordInterval(store,'tea-shop',0,15000,start+60000);
    assert.equal(readingWeek(store,start+60000,'UTC').days[0].state,'light');
    assert.throws(()=>recordInterval(store,'tea-shop',0,300000,start+300000));
  }finally{store.db.close();}
});

test('weekly circles distinguish unfinished activity from distinct finished stories',()=>{
  const store=new ReadingStore();
  const monday=Date.parse('2026-11-23T11:00:00Z'),tuesday=monday+86400000;
  try{
    assert.deepEqual(readingWeek(store,tuesday,'Europe/Amsterdam').days.map(d=>d.state),Array(7).fill('empty'));
    markAdvance(store,'tea-shop',0,monday);
    finishChapter(store,'tea-shop',0,monday);
    finishChapter(store,'tea-shop',1,tuesday);
    finishChapter(store,'tea-shop',1,tuesday+1000);
    const first=readingWeek(store,tuesday,'Europe/Amsterdam');
    assert.equal(first.finished,1);
    assert.deepEqual(first.days.map(d=>d.state),['light','full','empty','empty','empty','empty','empty']);
    const second={...store.story('tea-shop'),id:'second'};
    store.saveStory(second);
    finishChapter(store,'second',0,tuesday);
    finishChapter(store,'second',1,tuesday);
    assert.equal(readingWeek(store,tuesday,'Europe/Amsterdam').finished,2);
    recordAction(store,{storyId:'tea-shop',chapter:0,paragraph:0,token:5,id:'a',kind:'lookup'},tuesday+86400000);
    assert.equal(readingWeek(store,tuesday+86400000,'Europe/Amsterdam').days[2].state,'light');
  }finally{store.db.close();}
});

