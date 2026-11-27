import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishChapter } from '../src/completion.ts';
import { recordAction } from '../src/word-actions.ts';
import { adjustStrength,strengthFor } from '../src/strength.ts';
import { rateStory,storySummary } from '../src/story-summary.ts';

test('summary prioritizes targets, counts distinct net gains and preserves the completed result',async t=>{
  const store=await testStore();
  const words=['今天','天','我','去','看','你','她','茶','水'];
  await store.saveStory({id:'gains',title:'Today',difficulty:'medium',preview:{characters:[{text:'水'}],review:[]},
    chapters:[0,1].map(i=>({title:String(i),paragraphs:[words.map(text=>({text}))]}))});
  await adjustStrength(store.db,'character','我',36);
  await finishChapter(store,'gains',0);
  assert.equal((await strengthFor(store.db,'character','水')).score,null);
  await assert.rejects(()=>storySummary(store,'gains'),/Finish the story/);
  await adjustStrength(store.db,'character','水',4); // Another activity between chapters.
  await finishChapter(store,'gains',1);
  await finishChapter(store,'gains',1);
  assert.equal((await strengthFor(store.db,'character','天')).score,0.5);
  const gains=(await storySummary(store,'gains')).characterGains;
  assert.equal(gains.highlights[0].text,'水');
  assert.equal(gains.highlights[0].points,4);
  assert.equal(gains.highlights.length,5);
  assert.equal(gains.otherCount,3);
  assert.equal(gains.others.length,3);
  assert.equal(new Set([...gains.highlights,...gains.others].map(item=>item.text)).size,8);
  await adjustStrength(store.db,'character','水',-3);
  assert.deepEqual((await storySummary(store,'gains')).characterGains,gains);
});

test('an unmarked story still has a readable completion summary',async ()=>{
  const store=await testStore();
  await finishChapter(store,'tea-shop',0);
  await finishChapter(store,'tea-shop',1);
  const result=await storySummary(store,'tea-shop');
  assert.deepEqual(result.marked,[]);
  assert.equal(result.chapters,2);
  assert.equal(result.rating,null);
});

test('a completed story keeps marked sentences, optional rating, and independent reading strength',async ()=>{
  const store=await testStore();
  const storyId='tea-shop';
  await assert.rejects(()=>storySummary(store,storyId),/Finish/);
  await recordAction(store,{id:'a',kind:'lookup',storyId,chapter:0,paragraph:0,token:0});
  await recordAction(store,{id:'b',kind:'difficulty',storyId,chapter:0,paragraph:0,token:4});
  await finishChapter(store,storyId,0);
  await finishChapter(store,storyId,1);
  const result=await storySummary(store,storyId);
  assert.equal(result.chapters,2);
  assert.deepEqual(result.marked.map(word=>word.text),['和']);
  assert.deepEqual(result.marked[0].sentences,['今天下午，我和朋友去喝茶。']);
  assert.equal(result.rating,null);
  const before=await strengthFor(store.db,'word','和');
  await rateStory(store,storyId,'up');
  assert.equal((await storySummary(store,storyId)).rating,'up');
  assert.deepEqual(await strengthFor(store.db,'word','和'),before);
});
