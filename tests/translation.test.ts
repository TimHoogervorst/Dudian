import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { paragraphTranslation } from '../src/paragraph-translation.ts';
import { recordedStrengths } from '../src/strength.ts';

test('legacy paragraph translations share pending work and persist independently without awarding points',async t=>{
  const store=await testStore();
  let calls=0;
  const translate=async(input:string)=>{
    calls++;
    const {translateIndex}=JSON.parse(input);
    return 'English for paragraph '+translateIndex;
  };
  const get=(index:number)=>paragraphTranslation(store,'tea-shop',0,index,translate);
  const before=await recordedStrengths(store.db);
  await Promise.all([get(1),get(0),get(1)]);
  assert.equal(calls,2);
  assert.equal(await get(1),'English for paragraph 1');
  assert.equal(calls,2);
  assert.deepEqual((await store.story('tea-shop')).chapters[0].translations?.slice(0,2),['English for paragraph 0','English for paragraph 1']);
  assert.deepEqual(await recordedStrengths(store.db),before);
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM story_completions').get())?.n,0);
  await assert.rejects(get(999),/Choose a paragraph/);
  await assert.rejects(paragraphTranslation(store,'tea-shop',0,2,async()=>''),/No English translation/);
  assert.equal(await get(2),'English for paragraph 2');
});
