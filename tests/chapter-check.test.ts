import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterCheck,updateCheck } from '../src/chapter-check.ts';
import { finishChapter } from '../src/completion.ts';
import { strengthFor } from '../src/strength.ts';
import { storySummary } from '../src/story-summary.ts';
import { generateQuestions } from '../src/quiz-generation.ts';
import { buildPlan } from '../src/story-plan.ts';

test('saved difficulty rewards focused reading and unaided quiz answers once',async t=>{
  const store=await testStore();
  for(const [difficulty,points] of [['easy',1.5],['medium',2],['hard',2.5]] as const){
    const text={zh:'茶',en:'Tea'};
    const q={prompt:{zh:'茶水',en:'Tea or water?'},choices:[text],correct:0,paragraph:0,token:0,word:'茶',sense:'1',characters:[]};
    await store.saveStory({id:difficulty,title:'Tea',difficulty,preview:{characters:[{text:'朋'},{text:'茶'}],review:[{text:'朋友'}]},
      chapters:[{title:'Tea',questions:[q],paragraphs:[['茶','朋友','水'].map(text=>({text,sentence:0}))]}]});
    const items=['茶','朋友','朋','水'];
    const scores=async ()=>await Promise.all(items.map(async word=>(await strengthFor(store.db,'word',word)).score??0));
    const before=await scores();
    const input={action:'answer',question:0,choice:0};
    await updateCheck(store,difficulty,0,input);
    await updateCheck(store,difficulty,0,input);
    const award=Number((points*1.2).toFixed(3));
    assert.deepEqual((await scores()).map((score,i)=>Number((score-before[i]).toFixed(3))),[award,award,award,0.6]);
  }
});

test('approved quiz words with attached punctuation survive generation',async t=>{
  const store=await testStore();
  const chapter={title:'The Little Cup',paragraphs:[[{text:'茶',entry:'茶',sense:1}]]};
  const choices=['茶','水','家'].map((w,i)=>({zh:[w],en:['Tea','Water','Home'][i]}));
  const q={prompt:{zh:['什么？'],en:'What?'},choices,correct:0,paragraph:0,token:0,word:'茶',characters:[]};
  const questions=await generateQuestions(chapter,await buildPlan(store,'medium',2),['什么','茶','水','家'],
    async()=>JSON.stringify({questions:[q,{...q,prompt:{zh:['茶','？'],en:'Tea?'}}]}));
  assert.equal(questions.length,2);
  assert.deepEqual(questions[0].prompt.words,['什么','？']);
});

test('chapter answers persist once, translations affect credit, and final completion excludes tested items',async ()=>{
  const store=await testStore();
  const choices=[{zh:'椅子',en:'Chair'},{zh:'茶',en:'Tea'},{zh:'水',en:'Water'}];
  const words=['椅子','茶','水'];
  const questions=words.map((word,i)=>({prompt:{zh:'有什么？',en:'What was there?'},choices,correct:i,
    paragraph:0,token:i,word,sense:'1',characters:[word[0]]}));
  await store.saveStory({id:'quiz',title:'Room',chapters:[{title:'Inside',questions,
    paragraphs:[words.map(text=>({text,entry:text,sense:'1',sentence:0}))]}]});
  const answer=async (question:number,choice:number)=>await updateCheck(store,'quiz',0,{action:'answer',question,choice});
  await assert.rejects(()=>finishChapter(store,'quiz',0),/Answer the chapter/);
  assert.equal((await chapterCheck(store,'quiz',0)).questions[0].correct,undefined);
  assert.equal((await answer(0,0)).questions[0].evidence,'椅子茶水');
  assert.equal((await answer(0,1)).questions[0].choice,0);
  await updateCheck(store,'quiz',0,{question:1,action:'english'});
  assert.equal((await chapterCheck(store,'quiz',0)).questions[1].choices[0].en,'Chair');
  assert.equal((await answer(1,1)).completion.finished,false);
  assert.equal((await answer(2,0)).completion.finished,true);
  assert.equal((await answer(2,2)).questions[2].choice,0);
  assert.equal((await strengthFor(store.db,'word','椅子')).score,0.2);
  assert.equal((await strengthFor(store.db,'character','椅')).score,0.2);
  assert.equal((await strengthFor(store.db,'word','茶')).score,null);
  assert.equal((await strengthFor(store.db,'word','水')).score,null);
  assert.equal((await strengthFor(store.db,'character','水')).score,null);
  assert.deepEqual((await storySummary(store,'quiz')).quiz,{correct:2,total:3});
});

test('invalid question vocabulary is rejected before a chapter check can be saved',async()=>{
  const store=await testStore();
  const chapter=(await store.story('tea-shop')).chapters[0];
  const plan=await buildPlan(store,'easy',1);
  const prompt={zh:['直升机'],en:'Helicopter'};
  const choices=['茶','水','家'].map((w,i)=>({zh:[w],en:['Tea','Water','Home'][i]}));
  const q={prompt,choices,correct:0,paragraph:0,token:0,word:'茶',characters:[]};
  chapter.paragraphs[0][0]={text:'茶',entry:'茶',sense:'1',sentence:0};
  let calls=0;
  await assert.rejects(generateQuestions(chapter,plan,['茶','水','家'],async instructions=>{
    if(calls){
      assert.ok(instructions.includes(JSON.stringify({questions:[q]})));
      assert.match(instructions,/prompt\.zh contains “直升机”/);
    }
    calls++;
    return JSON.stringify({questions:[q]});
  }),/approved words/);
  assert.equal(calls,3);
});
