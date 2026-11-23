import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {strengthFor} from '../src/strength.ts';
import {recordAction, usageHistory} from '../src/word-actions.ts';

test('every word occurrence in the saved example resolves offline',()=>{
  const store=new ReadingStore();
  try {
    const story=store.story('tea-shop');
    for(const [chapter,part] of story.chapters.entries()){
      for(const [paragraph,line] of part.paragraphs.entries()){
        for(const [token,word] of line.entries()){
          if(!word.meaning)continue;
          const result=recordAction(store,{storyId:story.id,chapter,paragraph,token,id:[chapter,paragraph,token].join('/'),kind:'lookup'});
          assert.equal(result.text,word.text);
          assert.ok(result.pinyin);
        }
      }
    }
  }finally{store.db.close();}
});

test('an offline contextual lookup and a retried difficulty mark have distinct consequences',()=>{
  const store=new ReadingStore();
  try {
    const point={storyId:'tea-shop',chapter:0,paragraph:0,token:5};
    const result=recordAction(store,{...point,id:'lookup-one',kind:'lookup'},1000);
    assert.equal(result.text,'朋友');
    assert.equal(result.meaning,'friend');
    assert.equal(strengthFor(store.db,'word','朋友').color,'gray');
    assert.deepEqual(usageHistory(store,'朋'),[]);
    recordAction(store,{...point,id:'mark-one',kind:'difficulty'},2000);
    const score=strengthFor(store.db,'word','朋友');
    assert.equal(score.color,'red');
    recordAction(store,{...point,id:'mark-one',kind:'difficulty'},3000);
    assert.deepEqual(strengthFor(store.db,'word','朋友'),score);
    assert.equal(strengthFor(store.db,'character','朋').color,'gray');
    const history=usageHistory(store,'朋');
    assert.equal(history.length,1);
    assert.equal(history[0].word,'朋友');
    assert.equal(history[0].at,2000);
    assert.equal(history[0].sentence,'今天下午，我和朋友去喝茶。');
  } finally {store.db.close();}
});
