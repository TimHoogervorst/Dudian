import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {finishChapter} from '../src/completion.ts';
import {history,openStory} from '../src/history.ts';

test('the reading desk resumes a started story and retains finished history on reread',()=>{
  const store=new ReadingStore();
  assert.equal(history(store).current,null);
  const original=store.story('tea-shop');
  openStory(store,'tea-shop',1000);
  store.move('tea-shop',1,2);
  assert.equal(history(store).current?.chapterTitle,'A rainy afternoon');
  assert.equal(history(store).current?.paragraph,2);
  finishChapter(store,'tea-shop',0);
  finishChapter(store,'tea-shop',1);
  openStory(store,'tea-shop',2000);
  const shelf=history(store);
  assert.equal(shelf.current,null);
  assert.equal(shelf.stories[0].finished,true);
  assert.deepEqual(store.story('tea-shop'),original);
});
