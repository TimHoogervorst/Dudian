import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {encounterFor,seeItem} from '../src/encounters.ts';
import {adjustStrength,hskReadingProgress,setStrength,strengthFor} from '../src/strength.ts';
import {gradeCard,startSession} from '../src/flashcards.ts';
import {finishChapter} from '../src/completion.ts';
import {updateCheck} from '../src/chapter-check.ts';
import {buildPlan} from '../src/story-plan.ts';
import {planWordReviews} from '../src/word-review.ts';

const week=7*86_400_000;
test('seeing an overdue item preserves its due date until a decisive recall grade',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store;
  const at=Date.now()-week;
  const practice=(grade:string,now:number)=>{
    const session=startSession(db,{kind:'word',words:['水']});
    return gradeCard(db,session.id,0,grade,now).results![0].points;
  };
  assert.equal(practice('correct',at),3);
  store.saveStory({id:'water',title:'Water',chapters:[{title:'River',paragraphs:[[{text:'水'}]]}]});
  finishChapter(store,'water',0,at+week);
  assert.equal(strengthFor(db,'character','水').score,3);
  assert.deepEqual(encounterFor(db,'水'),{lastSeen:at+week,dueAt:at+week});
  assert.equal(practice('almost',at+week+1),0);
  assert.equal(practice('correct',at+week+2),0);
  assert.equal(encounterFor(db,'水').dueAt,at+2*week+2);
  assert.equal(practice('incorrect',at+2*week+2),-6);
  assert.equal(practice('incorrect',at+2*week+3),-3);
});

test('a compound recall and a question appearance leave overdue component reviews pending',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store,at=Date.now()-2*week;
  for(const text of ['东西','西','水']){
    adjustStrength(db,'word',text,8,at);
    seeItem(db,text,at);
  }
  const choices=[{zh:'东西',en:'Things'},{zh:'山',en:'Mountain'}];
  store.saveStory({id:'compound',title:'Things',chapters:[{title:'One',paragraphs:[[{text:'东西'}]],
    questions:[{prompt:{zh:'包包水',en:'Water?'},choices,correct:0,word:'东西',characters:[],sense:1,token:0,paragraph:0}]}]});
  updateCheck(store,'compound',0,{action:'answer',question:0,choice:0});
  for(const text of ['西','水']){
    assert.equal(strengthFor(db,'word',text).score,8);
    assert.equal(encounterFor(db,text).dueAt,at+week);
    assert.ok(encounterFor(db,text).lastSeen!>at);
  }
  assert.ok(encounterFor(db,'东西').dueAt!>Date.now());
  assert.equal(strengthFor(db,'character','东').score,0.6);
  for(const text of ['包','山'])assert.equal(strengthFor(db,'character',text).score,null);
});

test('automatic practice reserves space for an overdue Strong item and skips Perfect',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store,at=Date.now()-2*week;
  adjustStrength(db,'word','朋友',8,at);seeItem(db,'朋友',at);
  for(const text of ['学生','老师','苹果','中国','再见','今天'])adjustStrength(db,'word',text,-1);
  adjustStrength(db,'word','东西',12);
  const level=hskReadingProgress(db);
  adjustStrength(db,'word','东西',24);seeItem(db,'东西',at-1);
  assert.equal(hskReadingProgress(db),level);
  const plan=buildPlan(store,'medium',10);
  assert.equal(plan.reviewWords[0],'朋友');
  assert.ok(!plan.reviewWords.includes('东西'));
  const review=planWordReviews(store,plan)[0].words;
  assert.ok(review.includes('朋友') && !review.includes('东西'));
  for(const kind of ['mixed','word'] as const){
    const session=startSession(db,{kind,level:1});
    const cards=JSON.parse(String(db.prepare('SELECT deck FROM flashcard_sessions WHERE id=?').get(session.id)!.deck));
    assert.ok(cards.includes('朋友') && !cards.includes('东西'));
  }
  const explicit=startSession(db,{kind:'word',words:['东西']});
  assert.equal(gradeCard(db,explicit.id,0,'incorrect').results![0].points,0);
  assert.deepEqual(strengthFor(db,'word','东西'),{score:36,color:'gold'});
  assert.equal(setStrength(db,'word','东西','green').score,6);
});
