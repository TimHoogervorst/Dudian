import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAction,usageHistory } from '../src/word-actions.ts';
import { storySummary } from '../src/story-summary.ts';
import { finishChapter } from '../src/completion.ts';
import { strengthFor } from '../src/strength.ts';

test('a saved text-only cover supports word review in its own sentence without advancing the chapter',async ()=>{
  const store=await testStore();
  const original=await store.story('tea-shop');
  await store.saveStory({...original,id:'apples',cover:{teaser:'包包想买三个苹果。商店里有三个苹果吗？',prompt:''}});
  const tokens=(await store.story('apples')).cover!.tokens!;
  assert.equal(tokens.map(t=>t.text).join(''),'包包想买三个苹果。商店里有三个苹果吗？');
  assert.equal(tokens[0].cast,'baobao');
  const token=tokens.findIndex(t=>t.text==='苹果' && t.sentence===1);
  assert.ok(token>=0);
  const action={storyId:'apples',chapter:-1,paragraph:0,token,id:'cover-mark',kind:'difficulty' as const};
  await recordAction(store,action);await recordAction(store,action);
  assert.equal((await strengthFor(store.db,'word','苹果')).score,null);
  assert.equal((await usageHistory(store,'果'))[0].sentence,'商店里有三个苹果吗？');
  assert.deepEqual(await store.position('apples'),{chapter:0,paragraph:0});
  for(const [i] of original.chapters.entries())await finishChapter(store,'apples',i);
  assert.equal((await strengthFor(store.db,'word','苹果')).score,-3);
  assert.deepEqual((await storySummary(store,'apples')).marked,[{text:'苹果',sentences:['商店里有三个苹果吗？']}]);

});
