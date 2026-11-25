import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReadingStore,type ChapterQuestion} from '../src/store.ts';
import {finishChapter} from '../src/completion.ts';
import {chapterCheck,updateCheck} from '../src/chapter-check.ts';
import {storySummary} from '../src/story-summary.ts';
import {adjustStrength,strengthFor} from '../src/strength.ts';

function question(word:string,review=false):ChapterQuestion{
  const prompt={zh:word,en:'Choose the meaning'};
  return {word,prompt,choices:[prompt,{zh:'',en:'Other'}],correct:0,characters:[],paragraph:0,token:0,sense:1,
    ...(review?{reviewRound:1}:{})};
}
test('the story award survives a restart and scales only gains, once, across chapters',t=>{
  const dir=mkdtempSync(join(tmpdir(),'dudian-story-score-'));
  const file=join(dir,'reader.sqlite');
  let store=new ReadingStore(file);
  t.after(()=>{
    store.db.close();
    rmSync(dir,{recursive:true,force:true});
  });
  const id='two-chapters',words=['茶','花','天气','水'];
  const paragraphs=[words.map(text=>({text}))];
  store.saveStory({id,title:'Tea',difficulty:'hard',preview:{characters:[{text:'茶'}],review:[],wordReview:[{text:'天气'}]},
    chapters:[{title:'One',paragraphs,questions:[question('水'),question('天气',true)]},
      {title:'Two',paragraphs,questions:[question('水'),question('天气',true)]}]});
  const answer=(chapter:number,q:number,choice:number)=>updateCheck(store,id,chapter,{action:'answer',question:q,choice});
  answer(0,0,0);answer(0,1,0);
  assert.equal(strengthFor(store.db,'word','天气').score,null);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM score_changes').get()!.n,0);
  store.db.close();store=new ReadingStore(file);
  assert.equal(chapterCheck(store,id,0).questions[0].choice,0);
  adjustStrength(store.db,'character','茶',10); // Independent Library practice.
  answer(1,0,1);
  assert.equal(strengthFor(store.db,'character','水').score,null);
  answer(1,1,1);
  const score=(word:string)=>strengthFor(store.db,'word',word).score;
  assert.equal(score('茶'),12);  // 2 × 2.5 × 0.4, on top of Library practice
  assert.equal(score('天气'),-0.5); // 1.25 × 0.4 − 1
  assert.equal(score('水'),0.2);   // 0.5 × 0.4, no penalty or appearance credit on miss
  assert.equal(score('花'),0.2);   // two incidental appearances
  const summary=storySummary(store,id);
  assert.equal(summary.award!.multiplier,0.4);
  assert.equal(summary.award!.incorrect,2);
  assert.equal(summary.award!.penalties,1);
  assert.equal(summary.award!.awarded,2.3);
  const changes=store.db.prepare('SELECT count(*) AS n FROM score_changes').get()!.n;
  answer(1,1,0);finishChapter(store,id,1);
  assert.deepEqual(storySummary(store,id),summary);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM score_changes').get()!.n,changes);
});

test('first answers set every multiplier and ungraded stories earn no perfect-run bonus',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  for(const [total,wrong,factor] of [[0,0,1],[1,0,1.2],[10,1,1],[9,1,0.7],[4,1,0.7],
    [3,1,0.4],[2,1,0.4],[3,2,0.2],[10,7,0.2],[7,5,-0.5],[1,1,-0.5]]){
    const id='story-'+total+'-'+wrong;
    store.saveStory({id,title:id,chapters:[{title:id,paragraphs:[[{text:'人'}]],questions:Array.from({length:total},()=>question('水'))}]});
    for(let i=0;i<total;i++)updateCheck(store,id,0,{action:'answer',question:i,choice:Number(i<wrong)});
    finishChapter(store,id,0);
    const {award}=storySummary(store,id);
    assert.equal(award!.multiplier,factor);
    if(factor<0)assert.ok(Number(award!.awarded)<0);
  }
});

test('a partially graded story retains points already posted before the upgrade',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store,id='resume-legacy';
  store.saveStory({id,title:id,difficulty:'medium',preview:{characters:[{text:'水'}],review:[]},
    chapters:[{title:id,paragraphs:[[{text:'水'}]],questions:[question('水'),question('水'),question('茶')]}]});
  chapterCheck(store,id,0);
  db.prepare('INSERT INTO quiz_attempts VALUES(?,0,0,0,0)').run(id);
  adjustStrength(db,'character','水',2);
  db.prepare('INSERT INTO story_character_points VALUES(?,?,?)').run(id,'水',2);
  updateCheck(store,id,0,{action:'answer',question:1,choice:0});
  updateCheck(store,id,0,{action:'answer',question:2,choice:0});
  assert.equal(strengthFor(db,'character','水').score,2);
  assert.equal(strengthFor(db,'character','茶').score,0.6);
  assert.equal(storySummary(store,id).award!.awarded,0.6);
});

test('Perfect is earned from the adjusted award and the summary reports only available headroom',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const id='near-perfect';
  adjustStrength(store.db,'character','水',34);
  store.saveStory({id,title:id,difficulty:'hard',preview:{characters:[{text:'水'}],review:[]},
    chapters:[{title:'One',paragraphs:[[{text:'水'}]]},{title:'Two',paragraphs:[[{text:'水'}]],questions:[question('水')]}]});
  finishChapter(store,id,0);
  assert.equal(strengthFor(store.db,'character','水').score,34);
  updateCheck(store,id,1,{action:'answer',question:0,choice:0});
  const {award}=storySummary(store,id);
  assert.equal(award!.base,5);
  assert.equal(award!.awarded,2);
  assert.deepEqual(strengthFor(store.db,'character','水'),{score:36,color:'gold'});
});
