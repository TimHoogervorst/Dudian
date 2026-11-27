import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan,chapterFocus } from '../src/story-plan.ts';
import { storyFocus } from '../src/story-scoring.ts';
import { generateStory } from '../src/story-generation.ts';
import { withChapterQuestions } from './quiz-fixture.ts';

test('a word appearing elsewhere still needs to appear in its assigned chapter',async t=>{
  const store=await testStore();
  const plan={...await buildPlan(store,'easy',5),targetWords:20};
  const groups=chapterFocus(plan);
  const chapters=groups.map((group,i)=>({title:'Chapter '+(i+1),paragraphs:[[[...group.map(w=>w+':1'),'。']]]}));
  const affected=2,word=groups[affected][0];
  assert(groups[affected-1].includes(word));
  const draft=structuredClone(chapters);
  draft[affected].paragraphs[0][0].shift();
  const story=await generateStory(store,plan,withChapterQuestions(async prompt=>{
    if(prompt.includes('Validation feedback:')){
      assert(prompt.includes('Revise only chapter 3.'));
      assert(prompt.includes('chapter 3: '+word));
      return JSON.stringify(chapters[affected]);
    }
    return JSON.stringify({title:'A visit',chapters:draft});
  }));
  assert.deepEqual((await store.story(story.id)).chapters.map(ch=>ch.focus),groups);
  assert.equal(storyFocus(story,affected)(word),'strong');
  assert.notEqual(storyFocus(story,4)(word),'strong');
});

test('a correction replaces chapter three and preserves the first two chapters', async () => {
  const store=await testStore();
  const plan={...await buildPlan(store,'easy',5),newCharacters:[],newWords:[],chapterCount:3,targetWords:5};
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
  const store=await testStore();
  const plan={...await buildPlan(store,'easy',5),newCharacters:[],newWords:[],targetWords:8};
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
