import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadingStore,type ChapterQuestion } from '../src/store.ts';
import { finishChapter } from '../src/completion.ts';
import { chapterCheck,updateCheck } from '../src/chapter-check.ts';
import { storySummary } from '../src/story-summary.ts';
import { adjustStrength,strengthFor } from '../src/strength.ts';

function question(word:string,review=false):ChapterQuestion{
  const prompt={zh:word,en:'Choose the meaning'};
  return {word,prompt,choices:[prompt,{zh:'',en:'Other'}],correct:0,characters:[],paragraph:0,token:0,sense:1,
    ...(review?{reviewRound:1}:{})};
}
test('the story award survives a restart and scales only gains, once, across chapters',async t=>{
  let store=await testStore();
  const id='two-chapters',words=['茶','花','天气','水'];
  const paragraphs=[words.map(text=>({text}))];
  await store.saveStory({id,title:'Tea',difficulty:'hard',preview:{characters:[{text:'茶'}],review:[],wordReview:[{text:'天气'}]},
    chapters:[{title:'One',paragraphs,questions:[question('水'),question('天气',true)]},
      {title:'Two',paragraphs,questions:[question('水'),question('天气',true)]}]});
  const answer=async (chapter:number,q:number,choice:number)=>await updateCheck(store,id,chapter,{action:'answer',question:q,choice});
  await answer(0,0,0);await answer(0,1,0);
  assert.equal((await strengthFor(store.db,'word','天气')).score,null);
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM score_changes').get())!.n,0);
  store=new ReadingStore(store.db);
  assert.equal((await chapterCheck(store,id,0)).questions[0].choice,0);
  await adjustStrength(store.db,'character','茶',10); // Independent Library practice.
  await answer(1,0,1);
  assert.equal((await strengthFor(store.db,'character','水')).score,null);
  await answer(1,1,1);
  const score=async (word:string)=>(await strengthFor(store.db,'word',word)).score;
  assert.equal(await score('茶'),12);  // 2 × 2.5 × 0.4, on top of Library practice
  assert.equal(await score('天气'),-0.5); // 1.25 × 0.4 − 1
  assert.equal(await score('水'),0.2);   // 0.5 × 0.4, no penalty or appearance credit on miss
  assert.equal(await score('花'),0.2);   // two incidental appearances
  const summary=await storySummary(store,id);
  assert.equal(summary.award!.multiplier,0.4);
  assert.equal(summary.award!.incorrect,2);
  assert.equal(summary.award!.penalties,1);
  assert.equal(summary.award!.awarded,2.3);
  const changes=(await store.db.prepare('SELECT count(*) AS n FROM score_changes').get())!.n;
  await answer(1,1,0);await finishChapter(store,id,1);
  assert.deepEqual(await storySummary(store,id),summary);
  assert.equal((await store.db.prepare('SELECT count(*) AS n FROM score_changes').get())!.n,changes);
});

test('first answers set every multiplier and ungraded stories earn no perfect-run bonus',async t=>{
  const store=await testStore();
  for(const [total,wrong,factor] of [[0,0,1],[1,0,1.2],[10,1,1],[9,1,0.7],[4,1,0.7],
    [3,1,0.4],[2,1,0.4],[3,2,0.2],[10,7,0.2],[7,5,-0.5],[1,1,-0.5]]){
    const id='story-'+total+'-'+wrong;
    await store.saveStory({id,title:id,chapters:[{title:id,paragraphs:[[{text:'人'}]],questions:Array.from({length:total},()=>question('水'))}]});
    for(let i=0;i<total;i++)await updateCheck(store,id,0,{action:'answer',question:i,choice:Number(i<wrong)});
    await finishChapter(store,id,0);
    const {award}=await storySummary(store,id);
    assert.equal(award!.multiplier,factor);
    if(factor<0)assert.ok(Number(award!.awarded)<0);
  }
});

test('a partially graded story retains points already posted before the upgrade',async t=>{
  const store=await testStore();
  const {db}=store,id='resume-legacy';
  await store.saveStory({id,title:id,difficulty:'medium',preview:{characters:[{text:'水'}],review:[]},
    chapters:[{title:id,paragraphs:[[{text:'水'}]],questions:[question('水'),question('水'),question('茶')]}]});
  await chapterCheck(store,id,0);
  await db.prepare('INSERT INTO quiz_attempts(story_id,chapter,question,english,choice) VALUES($1,0,0,0,0)').run(id);
  await adjustStrength(db,'character','水',2);
  await db.prepare('INSERT INTO story_character_points(story_id,character,points) VALUES($1,$2,$3)').run(id,'水',2);
  await updateCheck(store,id,0,{action:'answer',question:1,choice:0});
  await updateCheck(store,id,0,{action:'answer',question:2,choice:0});
  assert.equal((await strengthFor(db,'character','水')).score,2);
  assert.equal((await strengthFor(db,'character','茶')).score,0.6);
  assert.equal((await storySummary(store,id)).award!.awarded,0.6);
});

test('Perfect is earned from the adjusted award and the summary reports only available headroom',async t=>{
  const store=await testStore();
  const id='near-perfect';
  await adjustStrength(store.db,'character','水',34);
  await store.saveStory({id,title:id,difficulty:'hard',preview:{characters:[{text:'水'}],review:[]},
    chapters:[{title:'One',paragraphs:[[{text:'水'}]]},{title:'Two',paragraphs:[[{text:'水'}]],questions:[question('水')]}]});
  await finishChapter(store,id,0);
  assert.equal((await strengthFor(store.db,'character','水')).score,34);
  await updateCheck(store,id,1,{action:'answer',question:0,choice:0});
  const {award}=await storySummary(store,id);
  assert.equal(award!.base,5);
  assert.equal(award!.awarded,2);
  assert.deepEqual(await strengthFor(store.db,'character','水'),{score:36,color:'gold'});
});
