import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {chapterCheck,updateCheck} from '../src/chapter-check.ts';
import {finishChapter} from '../src/completion.ts';
import {strengthFor} from '../src/strength.ts';
import {storySummary} from '../src/story-summary.ts';
import {generateQuestions} from '../src/quiz-generation.ts';
import {buildPlan} from '../src/story-plan.ts';

test('saved difficulty rewards focused reading and unaided quiz answers once',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  for(const [difficulty,points] of [['easy',1.5],['medium',2],['hard',2.5]] as const){
    const text={zh:'茶',en:'Tea'};
    const q={prompt:{zh:'茶水',en:'Tea or water?'},choices:[text],correct:0,paragraph:0,token:0,word:'茶',sense:'1',characters:[]};
    store.saveStory({id:difficulty,title:'Tea',difficulty,preview:{characters:[{text:'朋'},{text:'茶'}],review:[{text:'朋友'}]},
      chapters:[{title:'Tea',questions:[q],paragraphs:[['茶','朋友','水'].map(text=>({text,sentence:0}))]}]});
    const items=['茶','朋友','朋','水'];
    const scores=()=>items.map(word=>strengthFor(store.db,'word',word).score??0);
    const before=scores();
    const input={action:'answer',question:0,choice:0};
    updateCheck(store,difficulty,0,input);
    updateCheck(store,difficulty,0,input);
    const award=Number((points*1.2).toFixed(3));
    assert.deepEqual(scores().map((score,i)=>Number((score-before[i]).toFixed(3))),[award,award,award,0.6]);
  }
});

test('approved quiz words with attached punctuation survive generation',async t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const chapter={title:'The Little Cup',paragraphs:[[{text:'茶',entry:'茶',sense:1}]]};
  const choices=['茶','水','家'].map((w,i)=>({zh:[w],en:['Tea','Water','Home'][i]}));
  const q={prompt:{zh:['什么？'],en:'What?'},choices,correct:0,paragraph:0,token:0,word:'茶',characters:[]};
  const questions=await generateQuestions(chapter,buildPlan(store,'medium',2),['什么','茶','水','家'],
    async()=>JSON.stringify({questions:[q,{...q,prompt:{zh:['茶','？'],en:'Tea?'}}]}));
  assert.equal(questions.length,2);
  assert.deepEqual(questions[0].prompt.words,['什么','？']);
});

test('chapter answers persist once, translations affect credit, and final completion excludes tested items',()=>{
  const store=new ReadingStore();
  const choices=[{zh:'椅子',en:'Chair'},{zh:'茶',en:'Tea'},{zh:'水',en:'Water'}];
  const words=['椅子','茶','水'];
  const questions=words.map((word,i)=>({prompt:{zh:'有什么？',en:'What was there?'},choices,correct:i,
    paragraph:0,token:i,word,sense:'1',characters:[word[0]]}));
  store.saveStory({id:'quiz',title:'Room',chapters:[{title:'Inside',questions,
    paragraphs:[words.map(text=>({text,entry:text,sense:'1',sentence:0}))]}]});
  const answer=(question:number,choice:number)=>updateCheck(store,'quiz',0,{action:'answer',question,choice});
  assert.throws(()=>finishChapter(store,'quiz',0),/Answer the chapter/);
  assert.equal(chapterCheck(store,'quiz',0).questions[0].correct,undefined);
  assert.equal(answer(0,0).questions[0].evidence,'椅子茶水');
  assert.equal(answer(0,1).questions[0].choice,0);
  updateCheck(store,'quiz',0,{question:1,action:'english'});
  assert.equal(chapterCheck(store,'quiz',0).questions[1].choices[0].en,'Chair');
  assert.equal(answer(1,1).completion.finished,false);
  assert.equal(answer(2,0).completion.finished,true);
  assert.equal(answer(2,2).questions[2].choice,0);
  assert.equal(strengthFor(store.db,'word','椅子').score,0.2);
  assert.equal(strengthFor(store.db,'character','椅').score,0.2);
  assert.equal(strengthFor(store.db,'word','茶').score,null);
  assert.equal(strengthFor(store.db,'word','水').score,null);
  assert.equal(strengthFor(store.db,'character','水').score,null);
  assert.deepEqual(storySummary(store,'quiz').quiz,{correct:2,total:3});
});

test('invalid question vocabulary is rejected before a chapter check can be saved',async()=>{
  const store=new ReadingStore();
  const chapter=store.story('tea-shop').chapters[0];
  const plan=buildPlan(store,'easy',1);
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
