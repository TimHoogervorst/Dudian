import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan} from '../src/story-plan.ts';
import {ReadingStore} from '../src/store.ts';
import {generateStory} from '../src/story-generation.ts';

test('a correction replaces chapter three and preserves the first two chapters', async () => {
  const store=new ReadingStore();
  const plan={...buildPlan(store,'easy',30),targetWords:3};
  const chapter=(title:string,word:string)=>({title,paragraphs:[[[word+':1','。']]]});
  const first=chapter('Tea','茶');
  const second=chapter('Water','水');
  const candidate={title:'Drinks',chapters:[first,second,chapter('Home','直升机')]};
  const calls:string[]=[];
  const result=await generateStory(store,plan,async prompt=>{
    calls.push(prompt);
    return JSON.stringify(calls.length===1?candidate:chapter('Home','家'));
  });
  assert.equal(calls.length,2);
  assert.match(calls[1],/chapter 3/i);
  assert.match(calls[1],/直升机/);
  assert.deepEqual(result.chapters.map(c=>[c.title,c.paragraphs[0][0].text]),[['Tea','茶'],['Water','水'],['Home','家']]);
});
