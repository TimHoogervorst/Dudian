import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encounterFor,seeItem } from '../src/encounters.ts';
import { adjustStrength,hskReadingProgress,setStrength,strengthFor } from '../src/strength.ts';
import { gradeCard,startSession } from '../src/flashcards.ts';
import { finishChapter } from '../src/completion.ts';
import { updateCheck } from '../src/chapter-check.ts';
import { buildPlan } from '../src/story-plan.ts';
import { planWordReviews } from '../src/word-review.ts';

const week=7*86_400_000;
test('seeing an overdue item preserves its due date until a decisive recall grade',async t=>{
  const store=await testStore();
  const {db}=store;
  const at=Date.now()-week;
  const practice=async (grade:string,now:number)=>{
    const session=await startSession(db,{kind:'word',words:['水']});
    return (await gradeCard(db,session.id,0,grade,now)).results![0].points;
  };
  assert.equal(await practice('correct',at),3);
  await store.saveStory({id:'water',title:'Water',chapters:[{title:'River',paragraphs:[[{text:'水'}]]}]});
  await finishChapter(store,'water',0,at+week);
  assert.equal((await strengthFor(db,'character','水')).score,3);
  assert.deepEqual(await encounterFor(db,'水'),{lastSeen:at+week,dueAt:at+week});
  assert.equal(await practice('almost',at+week+1),0);
  assert.equal(await practice('correct',at+week+2),0);
  assert.equal((await encounterFor(db,'水')).dueAt,at+2*week+2);
  assert.equal(await practice('incorrect',at+2*week+2),-6);
  assert.equal(await practice('incorrect',at+2*week+3),-3);
});

test('a compound recall and a question appearance leave overdue component reviews pending',async t=>{
  const store=await testStore();
  const {db}=store,at=Date.now()-2*week;
  for(const text of ['东西','西','水']){
    await adjustStrength(db,'word',text,8,at);
    await seeItem(db,text,at);
  }
  const choices=[{zh:'东西',en:'Things'},{zh:'山',en:'Mountain'}];
  await store.saveStory({id:'compound',title:'Things',chapters:[{title:'One',paragraphs:[[{text:'东西'}]],
    questions:[{prompt:{zh:'包包水',en:'Water?'},choices,correct:0,word:'东西',characters:[],sense:1,token:0,paragraph:0}]}]});
  await updateCheck(store,'compound',0,{action:'answer',question:0,choice:0});
  for(const text of ['西','水']){
    assert.equal((await strengthFor(db,'word',text)).score,8);
    assert.equal((await encounterFor(db,text)).dueAt,at+week);
    assert.ok((await encounterFor(db,text)).lastSeen!>at);
  }
  assert.ok((await encounterFor(db,'东西')).dueAt!>Date.now());
  assert.equal((await strengthFor(db,'character','东')).score,0.6);
  for(const text of ['包','山'])assert.equal((await strengthFor(db,'character',text)).score,null);
});

test('automatic practice reserves space for an overdue Strong item and skips Perfect',async t=>{
  const store=await testStore();
  const {db}=store,at=Date.now()-2*week;
  await adjustStrength(db,'word','朋友',8,at);await seeItem(db,'朋友',at);
  for(const text of ['学生','老师','苹果','中国','再见','今天'])await adjustStrength(db,'word',text,-1);
  await adjustStrength(db,'word','东西',12);
  const level=await hskReadingProgress(db);
  await adjustStrength(db,'word','东西',24);await seeItem(db,'东西',at-1);
  assert.equal(await hskReadingProgress(db),level);
  const plan=await buildPlan(store,'medium',1);
  assert.equal(plan.reviewWords[0],'朋友');
  assert.ok(!plan.reviewWords.includes('东西'));
  const review=(await planWordReviews(store,plan))[0].words;
  assert.ok(review.includes('朋友') && !review.includes('东西'));
  for(const kind of ['mixed','word'] as const){
    const session=await startSession(db,{kind,level:1});
    const cards=JSON.parse(String((await db.prepare('SELECT deck FROM flashcard_sessions WHERE id=$1').get(session.id))!.deck));
    assert.ok(cards.includes('朋友') && !cards.includes('东西'));
  }
  const explicit=await startSession(db,{kind:'word',words:['东西']});
  assert.equal((await gradeCard(db,explicit.id,0,'incorrect')).results![0].points,0);
  assert.deepEqual(await strengthFor(db,'word','东西'),{score:36,color:'gold'});
  assert.equal((await setStrength(db,'word','东西','green')).score,6);
});
