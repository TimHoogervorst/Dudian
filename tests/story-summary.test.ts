import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {finishChapter} from '../src/completion.ts';
import {recordAction} from '../src/word-actions.ts';
import {strengthFor} from '../src/strength.ts';
import {rateStory,storySummary} from '../src/story-summary.ts';

test('an unmarked story still has a readable completion summary',()=>{
  const store=new ReadingStore();
  finishChapter(store,'tea-shop',0);
  finishChapter(store,'tea-shop',1);
  const result=storySummary(store,'tea-shop');
  assert.deepEqual(result.marked,[]);
  assert.equal(result.chapters,2);
  assert.equal(result.rating,null);
});

test('a completed story keeps marked sentences, optional rating, and independent reading strength',()=>{
  const store=new ReadingStore();
  const storyId='tea-shop';
  assert.throws(()=>storySummary(store,storyId),/Finish/);
  recordAction(store,{id:'a',kind:'lookup',storyId,chapter:0,paragraph:0,token:0});
  recordAction(store,{id:'b',kind:'difficulty',storyId,chapter:0,paragraph:0,token:4});
  finishChapter(store,storyId,0);
  finishChapter(store,storyId,1);
  const result=storySummary(store,storyId);
  assert.equal(result.chapters,2);
  assert.deepEqual(result.marked.map(word=>word.text),['和']);
  assert.deepEqual(result.marked[0].sentences,['今天下午，我和朋友去喝茶。']);
  assert.equal(result.rating,null);
  const before=strengthFor(store.db,'word','和');
  rateStory(store,storyId,'up');
  assert.equal(storySummary(store,storyId).rating,'up');
  assert.deepEqual(strengthFor(store.db,'word','和'),before);
});
