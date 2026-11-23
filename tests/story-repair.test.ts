import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan} from '../src/story-plan.ts';
import {ReadingStore} from '../src/store.ts';
import {generateStory} from '../src/story-generation.ts';
import {withChapterQuestions} from './quiz-fixture.ts';

test('a correction replaces chapter three and preserves the first two chapters', async () => {
  const store=new ReadingStore();
  const plan={...buildPlan(store,'easy',30),chapterCount:3,targetWords:3};
  const chapter=(title:string,word:string)=>({title,paragraphs:[[[word+':1','。']]]});
  const first=chapter('Tea','茶');
  const second=chapter('Water','水');
  const candidate={title:'Drinks',chapters:[first,second,chapter('Home','直升机')]};
  const calls:string[]=[];
  const result=await generateStory(store,plan,withChapterQuestions(async prompt=>{
    calls.push(prompt);
    return JSON.stringify(calls.length===1?candidate:chapter('Home','家'));
  }));
  assert.equal(calls.length,2);
  assert.match(calls[1],/chapter 3/i);
  assert.match(calls[1],/直升机/);
  assert.deepEqual(result.chapters.map(c=>[c.title,c.paragraphs[0][0].text]),[['Tea','茶'],['Water','水'],['Home','家']]);
});

test('later chapters get fresh retries and the model sees multiple invalid tokens together',async t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const plan={...buildPlan(store,'easy',30),targetWords:5};
  const chapter=(title:string,...tokens:string[])=>({title,paragraphs:[[tokens]]});
  const bad=chapter('Tea','直升机:1','茶:999');
  const good=chapter('Tea','茶:1');
  const draft={title:'Tea',chapters:[good,bad,bad,chapter('Water','水:1'),chapter('Home','家:1')]};
  const repairs:string[]=[];
  let calls=0;
  const story=await generateStory(store,plan,withChapterQuestions(async prompt=>{
    if(++calls===1)return JSON.stringify(draft);
    assert.match(prompt,/Validation feedback: .*直升机:1, 茶:999/);
    return JSON.stringify(calls<=3?bad:good);
  }),(stage,detail)=>{if(stage==='revising')repairs.push(detail!);});
  assert.deepEqual(repairs,['Correcting chapter 2 · attempt 1 of 3','Correcting chapter 2 · attempt 2 of 3',
    'Correcting chapter 2 · attempt 3 of 3','Correcting chapter 3 · attempt 1 of 3']);
  assert.equal(story.chapters.length,5);
});
