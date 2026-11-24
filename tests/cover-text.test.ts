import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {recordAction,usageHistory} from '../src/word-actions.ts';
import {storySummary} from '../src/story-summary.ts';
import {finishChapter} from '../src/completion.ts';
import {strengthFor} from '../src/strength.ts';

test('a saved text-only cover supports word review in its own sentence without advancing the chapter',()=>{
  const store=new ReadingStore();
  const original=store.story('tea-shop');
  store.saveStory({...original,id:'apples',cover:{teaser:'包包想买三个苹果。商店里有三个苹果吗？',prompt:''}});
  const tokens=store.story('apples').cover!.tokens!;
  assert.equal(tokens.map(t=>t.text).join(''),'包包想买三个苹果。商店里有三个苹果吗？');
  assert.equal(tokens[0].cast,'baobao');
  const token=tokens.findIndex(t=>t.text==='苹果' && t.sentence===1);
  assert.ok(token>=0);
  const action={storyId:'apples',chapter:-1,paragraph:0,token,id:'cover-mark',kind:'difficulty' as const};
  recordAction(store,action);recordAction(store,action);
  assert.equal(strengthFor(store.db,'word','苹果').score,null);
  assert.equal(usageHistory(store,'果')[0].sentence,'商店里有三个苹果吗？');
  assert.deepEqual(store.position('apples'),{chapter:0,paragraph:0});
  for(const [i] of original.chapters.entries())finishChapter(store,'apples',i);
  assert.equal(strengthFor(store.db,'word','苹果').score,-3);
  assert.deepEqual(storySummary(store,'apples').marked,[{text:'苹果',sentences:['商店里有三个苹果吗？']}]);
  store.db.close();
});
