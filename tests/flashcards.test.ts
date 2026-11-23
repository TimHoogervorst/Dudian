import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {startSession,gradeCard,readSession} from '../src/flashcards.ts';
import {adjustStrength,strengthFor} from '../src/strength.ts';
import {catalog} from '../src/catalog.ts';
import {flashcardExample} from '../src/flashcard-example.ts';

test('mixed practice pairs struggling compounds with their characters and grades them independently',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  for(const text of ['朋友','朋'])adjustStrength(store.db,'word',text,-3);
  let session=startSession(store.db,{kind:'mixed',level:1});
  for(let i=0;i<10;i++)session=gradeCard(store.db,session.id,i,session.card!.text==='朋'?'incorrect':'correct');
  const reviews=session.results!;
  assert.equal(reviews.filter(r=>r.kind==='word').length,6);
  assert.equal(reviews.filter(r=>r.kind==='character').length,4);
  assert.equal(reviews.find(r=>r.text==='朋')?.points,-3);
  assert.equal(reviews.find(r=>r.text==='朋友')?.points,3);
});

test('examples reuse story sentences, cache new examples, and leave the score and cursor alone',async t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const session=startSession(store.db,{kind:'word',words:['朋友','银行']});
  assert.deepEqual(await flashcardExample(store.db,session.id,0,async()=>{throw Error('Unexpected generation');}),
    {before:'今天下午，我和',target:'朋友',after:'去喝茶。'});
  assert.equal(strengthFor(store.db,'word','朋友').score,null);
  gradeCard(store.db,session.id,0,'correct');
  let calls=0;
  const write=async()=>{calls++;return JSON.stringify({before:'我去',after:'取钱。'});};
  for(let i=0;i<2;i++)assert.equal((await flashcardExample(store.db,session.id,1,write)).after,'取钱。');
  assert.equal(calls,1);
  assert.equal(readSession(store.db,session.id).index,1);
});

test('practice summary retains actual gains, losses and capped scores on retry and revisit',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const deck=startSession(store.db,{kind:'character',level:1});
  assert.equal(deck.results,undefined);
  let session=deck;
  for(let i=0;i<deck.total;i++){
    const text=session.card!.text;
    if(i===2)adjustStrength(store.db,'character',text,12);
    session=gradeCard(store.db,deck.id,i,i===1?'incorrect':'correct');
  }
  assert.deepEqual(session.results?.slice(0,3).map(item=>item.points),[3,-3,0]);
  assert.equal(session.results?.length,deck.total);
  adjustStrength(store.db,'character',String(session.results![0].text),-3);
  assert.deepEqual(gradeCard(store.db,deck.id,deck.total-1,'correct').results,session.results);
  assert.deepEqual(readSession(store.db,deck.id).results,session.results);
});

test('recall after local midnight earns another-day credit within the same UTC date', t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  for(const [word,zone,expected] of [['茶','Europe/Amsterdam',7],['水',undefined,5]] as const){
    for(const iso of ['2026-11-23T22:50:00Z','2026-11-23T23:01:00Z']){
      const session=startSession(store.db,{kind:'word',words:[word]});
      gradeCard(store.db,session.id,0,'correct',Date.parse(iso),zone);
    }
    assert.equal(strengthFor(store.db,'word',word).score,expected);
  }
  const session=startSession(store.db,{kind:'word',words:['茶']});
  assert.throws(()=>gradeCard(store.db,session.id,0,'correct',Date.now(),'not/a-zone'),/time zone/i);
});

test('a fresh learner can open either deck or review only a particular compound', t => {
  const store = new ReadingStore();
  t.after(()=>store.db.close());
  for (const kind of ['character','word'] as const) {
    const deck = startSession(store.db,{kind,level:1});
    assert.equal(deck.total,10);
    assert.equal(deck.kind,kind);
    assert(deck.card?.senses[0].pinyin);
  }
  const exact = startSession(store.db,{kind:'word',words:['银行','银行']});
  assert.equal(exact.total,1);
  assert.equal(exact.card?.text,'银行');
  assert(exact.card?.senses.some(s => s.meaning==='bank'));
});

test('grading is idempotent and affects only the reviewed item, with extra credit for later recall', t => {
  const store = new ReadingStore();
  t.after(()=>store.db.close());
  const review = (word:string,grade:string,at:number) => {
    const deck = startSession(store.db,{kind:'word',words:[word]});
    return gradeCard(store.db,deck.id,0,grade,at);
  };
  const day = Date.UTC(2026,1,1,12);
  const miss = review('银行','incorrect',day);
  assert.equal(miss.card,null);
  const initial = strengthFor(store.db,'word','银行');
  assert.equal(initial.color,'red');
  gradeCard(store.db,miss.id,0,'incorrect',day);
  assert.deepEqual(strengthFor(store.db,'word','银行'),initial);
  assert.equal(strengthFor(store.db,'character','银').color,'gray');
  review('学生','correct',day);
  assert.equal(strengthFor(store.db,'word','学生').color,'yellow');
  review('学生','correct',day+86400000);
  assert.equal(strengthFor(store.db,'word','学生').color,'green');
  review('学生','incorrect',day+86400010);
  assert.equal(strengthFor(store.db,'word','学生').color,'yellow');
  const deck = startSession(store.db,{kind:'word',level:catalog.get('word','银行')!.level!});
  const shown: string[] = [];
  for (let i=0;i<deck.total;i++) {
    shown.push(readSession(store.db,deck.id).card!.text);
    gradeCard(store.db,deck.id,i,'almost',day);
  }
  assert(shown.includes('银行'));
});
