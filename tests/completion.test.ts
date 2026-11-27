import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strengthFor } from '../src/strength.ts';
import { recordAction } from '../src/word-actions.ts';
import { finishChapter,completionFor } from '../src/completion.ts';

test('finishing grants distinct unaided credit once and completes a story only after all chapters',async ()=>{
  const store=await testStore();
  await recordAction(store,{id:'look',kind:'lookup',storyId:'tea-shop',chapter:0,paragraph:0,token:5});
  assert.deepEqual(await completionFor(store,'tea-shop'),{chapters:[],finished:false});
  const first=await finishChapter(store,'tea-shop',0,1000);
  assert.deepEqual(first,{chapters:[0],finished:false});
  assert.equal((await strengthFor(store.db,'word','朋友')).color,'gray');
  assert.equal((await strengthFor(store.db,'character','朋')).color,'gray');
  assert.equal((await strengthFor(store.db,'word','茶')).score,null);
  assert.equal((await strengthFor(store.db,'character','茶')).score,null);
  await finishChapter(store,'tea-shop',0,2000);
  assert.equal((await strengthFor(store.db,'word','茶')).score,null);
  assert.deepEqual(await finishChapter(store,'tea-shop',1,3000),{chapters:[0,1],finished:true});
  const before=await strengthFor(store.db,'word','朋友');
  assert.ok((await strengthFor(store.db,'word','茶')).score!>0);
  await recordAction(store,{id:'late',kind:'difficulty',storyId:'tea-shop',chapter:0,paragraph:0,token:5});
  assert.deepEqual(await strengthFor(store.db,'word','朋友'),before);
  await assert.rejects(()=>finishChapter(store,'tea-shop',-1));
});
