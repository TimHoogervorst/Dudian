import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession,gradeCard,readSession } from '../src/flashcards.ts';
import { adjustStrength,strengthFor } from '../src/strength.ts';
import { catalog } from '../src/catalog.ts';
import { flashcardExample } from '../src/flashcard-example.ts';

test('mixed practice pairs struggling compounds with their characters and grades them independently',async t=>{
  const store=await testStore();
  for(const text of ['朋友','朋'])await adjustStrength(store.db,'word',text,-3);
  let session=await startSession(store.db,{kind:'mixed',level:1});
  for(let i=0;i<10;i++)session=await gradeCard(store.db,session.id,i,session.card!.text==='朋'?'incorrect':'correct');
  const reviews=session.results!;
  assert.equal(reviews.filter(r=>r.kind==='word').length,6);
  assert.equal(reviews.filter(r=>r.kind==='character').length,4);
  assert.equal(reviews.find(r=>r.text==='朋')?.points,-3);
  assert.equal(reviews.find(r=>r.text==='朋友')?.points,3);
});

test('examples reuse story sentences, cache new examples, and leave the score and cursor alone',async t=>{
  const store=await testStore();
  const session=await startSession(store.db,{kind:'word',words:['朋友','银行']});
  assert.deepEqual(await flashcardExample(store.db,session.id,0,async()=>{throw Error('Unexpected generation');}),
    {before:'今天下午，我和',target:'朋友',after:'去喝茶。'});
  assert.equal((await strengthFor(store.db,'word','朋友')).score,null);
  await gradeCard(store.db,session.id,0,'correct');
  let calls=0;
  const write=async()=>{calls++;return JSON.stringify({before:'我去',after:'取钱。'});};
  for(let i=0;i<2;i++)assert.equal((await flashcardExample(store.db,session.id,1,write)).after,'取钱。');
  assert.equal(calls,1);
  assert.equal((await readSession(store.db,session.id)).index,1);
});

test('practice summary retains actual gains, losses and capped scores on retry and revisit',async t=>{
  const store=await testStore();
  const deck=await startSession(store.db,{kind:'character',level:1});
  assert.equal(deck.results,undefined);
  let session=deck;
  for(let i=0;i<deck.total;i++){
    const text=session.card!.text;
    if(i===2)await adjustStrength(store.db,'character',text,36);
    session=await gradeCard(store.db,deck.id,i,i===1?'incorrect':'correct');
  }
  assert.deepEqual(session.results?.slice(0,3).map(item=>item.points),[3,-3,0]);
  assert.equal(session.results?.length,deck.total);
  await adjustStrength(store.db,'character',String(session.results![0].text),-3);
  assert.deepEqual((await gradeCard(store.db,deck.id,deck.total-1,'correct')).results,session.results);
  assert.deepEqual((await readSession(store.db,deck.id)).results,session.results);
});

test('recall after local midnight earns another-day credit within the same UTC date', async t=>{
  const store=await testStore();
  for(const [word,zone,expected] of [['茶','Europe/Amsterdam',7],['水',undefined,5]] as const){
    for(const iso of ['2026-11-23T22:50:00Z','2026-11-23T23:01:00Z']){
      const session=await startSession(store.db,{kind:'word',words:[word]});
      await gradeCard(store.db,session.id,0,'correct',Date.parse(iso),zone);
    }
    assert.equal((await strengthFor(store.db,'word',word)).score,expected);
  }
  const session=await startSession(store.db,{kind:'word',words:['茶']});
  await assert.rejects(()=>gradeCard(store.db,session.id,0,'correct',Date.now(),'not/a-zone'),/time zone/i);
});

test('a fresh learner can open either deck or review only a particular compound', async t => {
  const store = await testStore();

  for (const kind of ['character','word'] as const) {
    const deck = await startSession(store.db,{kind,level:1});
    assert.equal(deck.total,10);
    assert.equal(deck.kind,kind);
    assert(deck.card?.senses[0].pinyin);
  }
  const exact = await startSession(store.db,{kind:'word',words:['银行','银行']});
  assert.equal(exact.total,1);
  assert.equal(exact.card?.text,'银行');
  assert(exact.card?.senses.some(s => s.meaning==='bank'));
});

test('grading is idempotent and affects only the reviewed item, with extra credit for later recall', async t => {
  const store = await testStore();

  const review = async (word:string,grade:string,at:number) => {
    const deck = await startSession(store.db,{kind:'word',words:[word]});
    return await gradeCard(store.db,deck.id,0,grade,at);
  };
  const day = Date.UTC(2026,1,1,12);
  const miss = await review('银行','incorrect',day);
  assert.equal(miss.card,null);
  const initial = await strengthFor(store.db,'word','银行');
  assert.equal(initial.color,'red');
  await gradeCard(store.db,miss.id,0,'incorrect',day);
  assert.deepEqual(await strengthFor(store.db,'word','银行'),initial);
  assert.equal((await strengthFor(store.db,'character','银')).color,'gray');
  await review('学生','correct',day);
  assert.equal((await strengthFor(store.db,'word','学生')).color,'yellow');
  await review('学生','correct',day+86400000);
  assert.equal((await strengthFor(store.db,'word','学生')).color,'green');
  await review('学生','incorrect',day+86400010);
  assert.equal((await strengthFor(store.db,'word','学生')).color,'yellow');
  const deck = await startSession(store.db,{kind:'word',level:catalog.get('word','银行')!.level!});
  const shown: string[] = [];
  for (let i=0;i<deck.total;i++) {
    shown.push((await readSession(store.db,deck.id)).card!.text);
    await gradeCard(store.db,deck.id,i,'almost',day);
  }
  assert(shown.includes('银行'));
});
