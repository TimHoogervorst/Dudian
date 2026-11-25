import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {buildPlan} from '../src/story-plan.ts';
import {reviewBoundaries,planWordReviews,wordReviewCards} from '../src/word-review.ts';
import {catalog} from '../src/catalog.ts';
import {chapterCheck,updateCheck,readerChapters} from '../src/chapter-check.ts';
import {storySummary} from '../src/story-summary.ts';
import {setStrength,strengthFor} from '../src/strength.ts';

test('reader highlights follow Library status for words and their individual characters',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const story={id:'unseen',title:'Unseen',chapters:[{title:'Reading',paragraphs:[[
    {text:'今天'},{text:'今天'},{text:'。'},{text:'包包',cast:'baobao' as const}]]}]};
  setStrength(store.db,'word','今天','green');
  setStrength(store.db,'character','今','yellow');
  assert.deepEqual(readerChapters(store,story)[0].unseenItems,['天']);
  setStrength(store.db,'word','今天','gray');
  setStrength(store.db,'character','今','red');
  const chapter=readerChapters(store,story)[0];
  assert.deepEqual(chapter.unseenItems,['今天','天']);
  assert.deepEqual(chapter.strugglingCharacters,['今']);
  setStrength(store.db,'character','今','green');
  assert.deepEqual(readerChapters(store,story)[0].strugglingCharacters,[]);
});

test('two ten-word reviews resume in order and count first answers once',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const plan=buildPlan(store,'hard',4);
  const schedules=[[0],[1],[1],[1,3],[1,3],[1,3,5]];
  for(const difficulty of ['easy','medium','hard'] as const){
    for(const [index,expected] of schedules.entries()){
      const selected={...plan,difficulty,chapterCount:index+1};
      assert.deepEqual(reviewBoundaries(selected),expected);
      assert.deepEqual(planWordReviews(store,selected).map(round=>round.words.length),
        expected.map(()=>({easy:2,medium:5,hard:10}[difficulty])));
    }
  }
  const rounds=planWordReviews(store,plan);
  const words=rounds.flatMap(r=>r.words);
  assert.deepEqual(rounds.map(r=>r.words.length),[10,10]);
  assert.equal(new Set(words).size,20);
  const limited=planWordReviews(store,{...plan,background:words.slice(0,14),newWords:[],reviewWords:[],compound:undefined});
  assert.ok(limited.every(r=>new Set(r.words).size===10));
  assert.equal(new Set(limited.flatMap(r=>r.words)).size,14);
  assert.ok(words.every(w=>[...w].length>1));
  const tokens=words.map(text=>{
    const sense=catalog.get('word',text)!.senses[0];
    return {text,entry:text,meaning:sense.meaning,sense:sense.id};
  });
  const chapter={title:'A visit',paragraphs:[tokens]};
  const questions=rounds.flatMap((r,i)=>wordReviewCards([chapter],r.chapter,r.words,i+1));
  store.saveStory({id:'visit',title:'A visit',difficulty:'hard',chapters:[{...chapter,questions}]});
  const answer=(i:number,choice:number)=>updateCheck(store,'visit',0,{action:'answer',question:i,choice});
  assert.throws(()=>answer(10,0),/preceding/);
  for(const i of [9,8,7,6,5,4,3,2,1,0,19,18,17,16,15,14,13,12,11,10]){
    const q=questions[i];
    assert.equal(new Set(q.choices.map(c=>c.en)).size,3);
    const choice=i===0?(q.correct+1)%3:q.correct;
    answer(i,choice);
    if(i===0){
      const [chapter]=readerChapters(store,store.story('visit'));
      assert.deepEqual(chapter.reviews,[{round:1,done:true,available:true},{round:2,done:false,available:true}]);
      assert.ok(chapter.readingDone);
      assert.ok(!('questions' in chapter));
    }
    const score=strengthFor(store.db,'word',q.word).score;
    answer(i,(choice+1)%3);
    assert.equal(strengthFor(store.db,'word',q.word).score,score);
    assert.equal(chapterCheck(store,'visit',0).questions[i].choice,choice);
  }
  assert.deepEqual(storySummary(store,'visit').wordReview,{correct:19,total:20});
});
