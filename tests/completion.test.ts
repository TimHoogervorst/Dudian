import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {strengthFor} from '../src/strength.ts';
import {recordAction} from '../src/word-actions.ts';
import {finishChapter,completionFor} from '../src/completion.ts';

test('finishing grants distinct unaided credit once and completes a story only after all chapters',()=>{
  const store=new ReadingStore();
  try {
    recordAction(store,{id:'look',kind:'lookup',storyId:'tea-shop',chapter:0,paragraph:0,token:5});
    assert.deepEqual(completionFor(store,'tea-shop'),{chapters:[],finished:false});
    const first=finishChapter(store,'tea-shop',0,1000);
    assert.deepEqual(first,{chapters:[0],finished:false});
    assert.equal(strengthFor(store.db,'word','朋友').color,'gray');
    assert.equal(strengthFor(store.db,'character','朋').color,'gray');
    assert.equal(strengthFor(store.db,'word','茶').score,null);
    assert.equal(strengthFor(store.db,'character','茶').score,null);
    finishChapter(store,'tea-shop',0,2000);
    assert.equal(strengthFor(store.db,'word','茶').score,null);
    assert.deepEqual(finishChapter(store,'tea-shop',1,3000),{chapters:[0,1],finished:true});
    const before=strengthFor(store.db,'word','朋友');
    assert.ok(strengthFor(store.db,'word','茶').score!>0);
    recordAction(store,{id:'late',kind:'difficulty',storyId:'tea-shop',chapter:0,paragraph:0,token:5});
    assert.deepEqual(strengthFor(store.db,'word','朋友'),before);
    assert.throws(()=>finishChapter(store,'tea-shop',-1));
  }finally{store.db.close();}
});
