import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {ReadingStore} from '../src/store.ts';
import {buildPlan} from '../src/story-plan.ts';
import {initializeGeneration,latestGeneration,startGeneration} from '../src/generation-job.ts';
import {withChapterQuestions} from './quiz-fixture.ts';
import {setArtSettings} from '../src/cover-art.ts';

test('a pending story stays available across requests and duplicate starts share the same draft',async()=>{
  const store=new ReadingStore();
  initializeGeneration(store);
  setArtSettings(store,{enabled:false});
  const plan=buildPlan(store,'easy',10);
  let finish!:(value:string)=>void;
  const draft=new Promise<string>(resolve=>{finish=resolve;});
  assert.equal(startGeneration(store,'easy',10,withChapterQuestions(()=>draft))?.stage,'planning');
  await nextTurn();
  assert.equal(latestGeneration(store)?.stage,'writing');
  assert.equal(startGeneration(store,'hard',30)?.difficulty,'easy');
  const words=[...plan.newWords,...(plan.compound?[plan.compound]:[]),...Array(plan.targetWords).fill(plan.background[0])];
  finish(JSON.stringify({title:'Morning',chapters:[{title:'Tea',paragraphs:[[words.map(word=>word+':1')]]}]}));
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
  startGeneration(store,'easy',10,fail);
  await nextTurn();
  assert.equal(latestGeneration(store)?.error,'Reconnect in Settings');
  assert.equal(latestGeneration(store)?.failedStage,'writing');
  assert.equal(startGeneration(store,'medium',30,fail)?.stage,'planning');
  await nextTurn();
  assert.equal(latestGeneration(store)?.stage,'failed');
});
