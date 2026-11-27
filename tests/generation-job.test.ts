import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { testStore } from './postgres-fixture.ts';
import { generationWorker,latestGeneration,startGeneration } from '../src/generation-job.ts';
import { setArtSettings } from '../src/cover-art.ts';
import { setStrength } from '../src/strength.ts';

async function until<T>(read:()=>Promise<T>,ready:(value:T)=>boolean) {
  const end=Date.now()+15000;
  while(Date.now()<end) {
    const value=await read();
    if(ready(value))return value;
    await delay(20);
  }
  throw Error('Timed out waiting for generation.');
}

test('one worker handles two learner requests in order and publishes the finished story to both',async()=>{
  const alice=await testStore(),bob=await testStore(alice.db.pool);
  await setArtSettings(alice,{enabled:false});
  await setStrength(bob.db,'character','茶','green');
  const first=await startGeneration(alice,'easy',1);
  const second=await startGeneration(bob,'medium',2);
  assert.notEqual(first.id,second.id);
  const [a,b]=await Promise.all([alice,bob].map(store=>store.db.prepare('SELECT plan FROM generation_job').get()));
  assert.notDeepEqual(JSON.parse(a.plan).plan.characters,JSON.parse(b.plan).plan.characters);
  let finish!:(text:string)=>void;
  const draft=new Promise<string>(resolve=>{finish=resolve;});
  let drafts=0;
  const write=async(prompt:string)=>{
    if(prompt.startsWith('Write a chapter comprehension check.')) return JSON.stringify({questions:[{
      prompt:{zh:['我'],en:'Who is speaking?'},choices:['我','你','包包'].map(zh=>({zh:[zh],en:zh==='我'?'Me':zh==='你'?'You':'Baobao'})),
      correct:0,word:'我',paragraph:0,token:0,characters:[]}]});
    if(++drafts===1)return draft;
    throw Error('Provider limit');
  };
  const stop=generationWorker(alice.db.pool,write);
  try {
    await until(()=>latestGeneration(alice),job=>job?.stage==='writing');
    assert.equal((await latestGeneration(bob)).stage,'queued');
    const words=['我:1','是:1','包包:1','。'];
    finish(JSON.stringify({title:'Morning',teaser:words,chapters:[{title:'Hello',paragraphs:[[words]],translations:['I am Baobao.']}]}));
    const job=await until(()=>latestGeneration(alice),job=>['ready','failed'].includes(job?.stage));
    assert.equal(job.stage,'ready',job.error);
    assert.equal((await bob.story(job.storyId)).title,'Morning');
    const failed=await until(()=>latestGeneration(bob),job=>job?.stage==='failed');
    assert.equal(failed.error,'Provider limit');
    assert.equal((await latestGeneration(alice)).id,first.id);
  } finally { await stop(); }
});
