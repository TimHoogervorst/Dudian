import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {catalog} from '../src/catalog.ts';
import {seeItem} from '../src/encounters.ts';
import {setStrength} from '../src/strength.ts';
import {milestoneProgress} from '../src/milestone-progress.ts';
import {generateTest,startTest,submitTest,testView} from '../src/milestone-test.ts';
import {createApp} from '../src/server.ts';

const line=(text:string)=>({text,pinyin:'pīn yīn'});
async function passages(prompt:string){
  const plan=JSON.parse(prompt.match(/ordered plan: (\[.*\])\./)![1]);
  return JSON.stringify(plan.map(({targets}: {targets:string[]})=>({
    title:'早上',lines:[line(targets.join('。'))],questions:targets.map(word=>({prompt:line(word),
      choices:['甲','乙','丙','丁'].map(line),correct:0,explanation:'The passage gives the first answer.'}))
  })));
}

test('eligibility remembers a crossed threshold and ordinary character encounters after a reset',async t=>{
  const {db}=new ReadingStore();t.after(()=>db.close());
  const chars=catalog.libraryItems('character',1);
  for(const kind of ['character','word'] as const)
    for(const {text} of catalog.libraryItems(kind,1))setStrength(db,kind,text,'green');
  setStrength(db,'character',chars[0].text,'gray');
  let progress=milestoneProgress(db);
  assert.equal(progress.milestone,1);
  assert(progress.level<1);
  assert.equal(progress.missing.length,chars.length);
  await assert.rejects(generateTest(db,1,passages),/requirements/);
  seeItem(db,chars.map(c=>c.text).join(''),Date.now());
  setStrength(db,'character',chars[1].text,'gray');
  progress=milestoneProgress(db);
  assert.equal(progress.missing.length,0);
  assert.equal(progress.passed,0);
});

test('a milestone attempt resumes, grades matching pairs, retries and passes without learning evidence',async t=>{
  const {db}=new ReadingStore();t.after(()=>db.close());
  db.exec('UPDATE milestone_progress SET reached=2');
  for(const level of [1,2])for(const {text} of catalog.libraryItems('character',level))seeItem(db,text,1);
  const evidence=()=>['reading_strength','score_changes','item_encounters','milestone_characters'].map(table=>
    db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all());
  milestoneProgress(db);
  const before=evidence();
  await assert.rejects(generateTest(db,1,async()=>'[]'),/incomplete/);
  const [id,duplicate]=await Promise.all([generateTest(db,1,passages),generateTest(db,1,passages)]);
  assert.equal(id,duplicate);
  const intro=testView(db,id);
  assert.equal(intro.status,'ready');
  assert.equal(intro.outline.length,15);
  assert.equal(intro.outline.reduce((n,s)=>n+s.count,0),28);

  function run(id:string,fail:boolean){
    const sections=JSON.parse(String(db.prepare('SELECT sections FROM milestone_tests WHERE id=?').get(id)!.sections));
    let view=startTest(db,id);
    while('section' in view){
      assert.deepEqual(view,testView(db,id));
      const s=sections[view.section],e=s.exercises[view.task];
      const answers=e?e.targets.map((item:{meaning:string})=>e.options.indexOf(item.meaning)):[s.questions[view.task].correct];
      if(view.index<3)answers[0]=(answers[0]+1)%(e?.options.length??4);
      if(fail&&e?.type==='match')[answers[0],answers[1]]=[answers[1],answers[0]];
      const index=view.index;
      view=submitTest(db,id,index,answers);
      assert.deepEqual(submitTest(db,id,index,answers),view);
      if(view.status==='active')assert(!('review' in view));
    }
    return view;
  }
  const failed=run(id,true);
  assert.equal(failed.status,'failed');
  assert.equal(failed.mistakes,5);
  const retry=await generateTest(db,1,passages);
  assert.notEqual(id,retry);
  const passed=run(retry,false);
  assert.equal(passed.status,'passed');
  assert.equal(passed.mistakes,3);
  assert.equal(milestoneProgress(db).milestone,2);
  assert.deepEqual(evidence(),before);
});

test('dashboard and Progression share a capped score and attempt while formats follow earned progress',async t=>{
  const store=new ReadingStore();
  const {db}=store;
  for(const level of [1,2])for(const kind of ['character','word'] as const){
    for(const {text} of catalog.libraryItems(kind,level)){
      setStrength(db,kind,text,'green');
      seeItem(db,text,1);
    }
  }
  const id=await generateTest(db,1,passages);
  const server=await createApp(store);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();});
  const base='http://127.0.0.1:'+server.address()!.port+'/api/';
  const get=async(path:string)=>(await fetch(base+path)).json();
  const home=await get('reading-progress'),progression=await get('progression');
  assert.equal(home.level,1);
  assert.equal(home.attempt.id,id);
  assert.deepEqual(home.attempt,progression.attempt);
  assert.equal(progression.level,1);
  assert(progression.groups.flatMap(group=>group.cards).some(card=>card.threshold===2&&card.unlocked));
  const path='milestone-tests/'+id;
  assert.equal((await get(path)).status,'ready');
  await fetch(base+path+'/start',{method:'POST'});
  const active=await get(path);
  assert.equal(active.status,'active');
  assert.equal(active.question.correct,undefined);
  assert.equal(active.question.explanation,undefined);
});
