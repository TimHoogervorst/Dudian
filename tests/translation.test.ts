import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {paragraphTranslation} from '../src/paragraph-translation.ts';
import {recordedStrengths} from '../src/strength.ts';

test('legacy paragraph translations share pending work and persist independently without awarding points',async t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  let calls=0;
  const translate=async(input:string)=>{
    calls++;
    const {translateIndex}=JSON.parse(input);
    return 'English for paragraph '+translateIndex;
  };
  const get=(index:number)=>paragraphTranslation(store,'tea-shop',0,index,translate);
  const before=recordedStrengths(store.db);
  await Promise.all([get(1),get(0),get(1)]);
  assert.equal(calls,2);
  assert.equal(await get(1),'English for paragraph 1');
  assert.equal(calls,2);
  assert.deepEqual(store.story('tea-shop').chapters[0].translations?.slice(0,2),['English for paragraph 0','English for paragraph 1']);
  assert.deepEqual(recordedStrengths(store.db),before);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM story_completions').get()?.n,0);
  await assert.rejects(get(999),/Choose a paragraph/);
  await assert.rejects(paragraphTranslation(store,'tea-shop',0,2,async()=>''),/No English translation/);
  assert.equal(await get(2),'English for paragraph 2');
});
