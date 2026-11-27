import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishChapter } from '../src/completion.ts';
import { recordAction } from '../src/word-actions.ts';
import { recordInterval,markAdvance,readingWeek } from '../src/activity.ts';

test('one active minute qualifies and overlapping device intervals count once',async ()=>{
  const store=await testStore();
  const start=Date.parse('2026-11-23T11:00:00Z');
  await recordInterval(store,'tea-shop',0,30000,start+30000);
  await recordInterval(store,'tea-shop',0,30000,start+45000);
  assert.equal((await readingWeek(store,start+45000,'UTC')).days[0].state,'empty');
  await recordInterval(store,'tea-shop',0,15000,start+60000);
  assert.equal((await readingWeek(store,start+60000,'UTC')).days[0].state,'light');
  await assert.rejects(()=>recordInterval(store,'tea-shop',0,300000,start+300000));
});

test('weekly circles distinguish unfinished activity from distinct finished stories',async ()=>{
  const store=await testStore();
  const monday=Date.parse('2026-11-23T11:00:00Z'),tuesday=monday+86400000;
  assert.deepEqual((await readingWeek(store,tuesday,'Europe/Amsterdam')).days.map(d=>d.state),Array(7).fill('empty'));
  await markAdvance(store,'tea-shop',0,monday);
  await finishChapter(store,'tea-shop',0,monday);
  await finishChapter(store,'tea-shop',1,tuesday);
  await finishChapter(store,'tea-shop',1,tuesday+1000);
  const first=await readingWeek(store,tuesday,'Europe/Amsterdam');
  assert.equal(first.finished,1);
  assert.deepEqual(first.days.map(d=>d.state),['light','full','empty','empty','empty','empty','empty']);
  const second={...await store.story('tea-shop'),id:'second'};
  await store.saveStory(second);
  await finishChapter(store,'second',0,tuesday);
  await finishChapter(store,'second',1,tuesday);
  assert.equal((await readingWeek(store,tuesday,'Europe/Amsterdam')).finished,2);
  await recordAction(store,{storyId:'tea-shop',chapter:0,paragraph:0,token:5,id:'a',kind:'lookup'},tuesday+86400000);
  assert.equal((await readingWeek(store,tuesday+86400000,'Europe/Amsterdam')).days[2].state,'light');
});
