import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {ReadingStore} from '../src/store.ts';
import {initializeGeneration,latestGeneration,startGeneration} from '../src/generation-job.ts';
import {setArtSettings} from '../src/cover-art.ts';

test('a pending story stays available across requests and duplicate starts share the same draft',async()=>{
  const store=new ReadingStore();
  initializeGeneration(store);
  setArtSettings(store,{enabled:false});
  let finish!:(value:string)=>void;
  const draft=new Promise<string>(resolve=>{finish=resolve;});
  const write=async(prompt:string)=>prompt.startsWith('Write a chapter comprehension check.')?
    JSON.stringify({questions:[{prompt:{zh:['我'],en:'Who is speaking?'},choices:['我','你','包包'].map(zh=>({zh:[zh],en:zh==='我'?'Me':zh==='你'?'You':'Baobao'})),
      correct:0,word:'我',paragraph:0,token:0,characters:[]}]}):draft;
  assert.equal(startGeneration(store,'easy',1,write)?.stage,'planning');
  await nextTurn();
  assert.equal(latestGeneration(store)?.stage,'writing');
  assert.equal(startGeneration(store,'hard',5)?.difficulty,'easy');
  const greeting=['我:1','是:1','包包:1','。'];
  finish(JSON.stringify({title:'Morning',teaser:greeting,chapters:[{title:'Hello',paragraphs:[[greeting]],translations:['I am Baobao.']}]}));
  await nextTurn();
  const job=latestGeneration(store);
  assert.equal(job?.stage,'ready',String(job?.error));
  assert.equal(store.story(String(job.storyId)).title,'Morning');
  initializeGeneration(store);
  assert.deepEqual(latestGeneration(store),job);
});

test('a failed generation can be started again',async()=>{
  const store=new ReadingStore();
  initializeGeneration(store);
  const fail=async()=>{throw Error('Reconnect in Settings');};
  startGeneration(store,'easy',1,fail);
  await nextTurn();
  assert.equal(latestGeneration(store)?.error,'Reconnect in Settings');
  assert.equal(latestGeneration(store)?.failedStage,'writing');
  assert.equal(startGeneration(store,'medium',5,fail)?.stage,'planning');
  await nextTurn();
  assert.equal(latestGeneration(store)?.stage,'failed');
});
