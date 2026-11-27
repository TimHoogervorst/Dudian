import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startPractice,practiceView,submitPractice,extendPractice } from '../src/library-practice.ts';
import { catalog } from '../src/catalog.ts';
import { seeItem } from '../src/encounters.ts';
import { strengthFor } from '../src/strength.ts';

test('beginner practice tests the preferred sense and uses examples annotated for that sense',async t=>{
  const {db}=await testStore();
  const primary=catalog.studySense('听')!;
  const senses=catalog.get('character','听')!.senses;
  const archaic=senses.find(s=>s.pinyin==='yǐn')!;
  const can=senses.find(s=>s.meaning.includes('a can'))!;
  const paragraphs=[archaic,can,primary].map(s=>[
    {text:'听',sense:s.id,sentence:0},{text:s.id===primary.id?'音乐。':'。',sentence:0}
  ]);
  await db.prepare('INSERT INTO stories(id,title,content,created_at) VALUES($1,$2,$3,$4)')
    .run('readings','Readings',JSON.stringify({chapters:[{paragraphs}]}),Date.now());
  const session=await startPractice(db,{kind:'character',words:['听']});
  assert.equal(session.exercise!.targets[0].pinyin,'tīng');
  assert.deepEqual(session.exercise!.example,{before:'',target:'听',after:'音乐。'});
  const answer=session.exercise!.options.indexOf('to listen to; to hear');
  assert((await submitPractice(db,session.id,0,[answer])).feedback[0].correct);
  assert.equal(catalog.get('character','听',archaic.id)!.senses.find(s=>s.id===archaic.id)?.meaning,'smile (archaic)');
});

test('a matching board checks all rows once, persists progress, and rejects partial or changed submissions',async t=>{
  const {db}=await testStore();
  const words=['朋友','水','学生','银行','茶'];
  for(const text of ['朋友','学生'])await seeItem(db,text,1,true);
  const set=await startPractice(db,{kind:'word',words});
  const board=set.exercise!;
  assert.equal(board.type,'match');
  assert.equal(board.targets.length,5);
  const answers=board.targets.map(item=>{
    const senses=catalog.get('word',item.text)!.senses;
    return board.options.findIndex(option=>senses.some(s=>s.meaning===option));
  });
  assert.equal(new Set(answers).size,5);
  [answers[0],answers[1]]=[answers[1],answers[0]];
  await assert.rejects(()=>submitPractice(db,set.id,0,answers.slice(1)),/every entry/);
  assert.equal((await strengthFor(db,'word',words[0])).score,null);
  const checked=await submitPractice(db,set.id,0,answers);
  assert.deepEqual(checked.feedback.map(row=>row.correct),[false,false,true,true,true]);
  assert.deepEqual(checked.next.results!.map(row=>row.points),[-0.5,-0.5,0.5,0.5,0.5]);
  assert.deepEqual(await practiceView(db,set.id),checked.next);
  assert.deepEqual(await submitPractice(db,set.id,0,answers),checked);
  await assert.rejects(()=>submitPractice(db,set.id,0,[...answers].reverse()),/already been checked/);
});

test('one entry starts a choice and grades only its target',async t=>{
  const {db}=await testStore();
  const set=await startPractice(db,{kind:'character',words:['水']});
  const ex=set.exercise!;
  assert.equal(ex.type,'choice');
  assert.equal(ex.targets[0].text,'水');
  assert.equal(ex.options.length,6);
  assert.equal(new Set(ex.options).size,6);
  const checked=await submitPractice(db,set.id,0,[ex.options.indexOf('water')]);
  assert(checked.feedback[0].correct);
  assert.equal((await strengthFor(db,'character','水')).score,0.5);
  assert.equal(checked.next.results!.length,1);
  assert.equal(checked.next.remainingDue,0);
});

test('ten exercises combine formats and continue only with fresh overdue targets',async t=>{
  const {db}=await testStore();
  const overdue=catalog.libraryItems('character',1).slice(0,34);
  for(const {text} of overdue)await seeItem(db,text,1,true);
  let set=await startPractice(db,{kind:'mixed',level:1});
  const firstId=set.id;
  assert.equal(set.total,10);
  const tested=new Set<string>();
  while(set.exercise){
    const ex=set.exercise;
    for(const {text} of ex.targets){assert(!tested.has(text));tested.add(text);}
    set=(await submitPractice(db,set.id,set.index,ex.targets.map((_,i)=>i))).next;
  }
  assert(tested.size>10);
  assert.equal(set.remainingDue,overdue.filter(i=>!tested.has(i.text)).length);
  set=await extendPractice(db,firstId);
  assert.equal((await extendPractice(db,firstId)).id,set.id);
  while(set.exercise){
    const ex=set.exercise;
    for(const {text} of ex.targets){assert(!tested.has(text));assert(overdue.some(i=>i.text===text));tested.add(text);}
    set=(await submitPractice(db,set.id,set.index,ex.targets.map((_,i)=>i))).next;
  }
  assert.equal(set.remainingDue,0);
});
