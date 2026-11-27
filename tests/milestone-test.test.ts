import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/catalog.ts';
import { seeItem } from '../src/encounters.ts';
import { setStrength } from '../src/strength.ts';
import { milestoneProgress } from '../src/milestone-progress.ts';
import { discardTest,generateTest,prepareMilestones,preparation,saveDraft,startTest,submitTest,testView } from '../src/milestone-test.ts';
import { createApp } from '../src/server.ts';

async function passages(prompt:string){
  if(prompt.startsWith('Write a chapter comprehension check')){
    const targets=prompt.match(/as the cited word: (.+)/)![1].split('、');
    const bilingual=(zh:string)=>({zh:[zh],en:'Meaning of '+zh});
    return JSON.stringify({questions:targets.map((word,token)=>({word,token,paragraph:0,characters:[],correct:0,
      prompt:bilingual(word),choices:['我','你','他'].map(bilingual)}))});
  }
  const targets=prompt.match(/Use each teaching word at least once: (.+)/)![1].split('、');
  const sentence=Array.from({length:30},(_,i)=>targets[i%2]+':1').concat('。');
  if(prompt.includes('The protagonist is always'))sentence.splice(-1,0,'包包:1');
  const people=Number(prompt.match(/array of exactly (\d+) distinct short display names/)?.[1]);
  const document=prompt.match(/Chapter documents in order: (.+?)\./)?.[1];
  const roles=document==='Letter'?['greeting','body','body','body','signature']:
    document==='Recipe'?['ingredients','step','step']:['lead','report'];
  const count=people?14:document?roles.length:3;
  const chapter={title:'At the station',paragraphs:Array.from({length:count},()=>[sentence]),
    translations:Array(count).fill('They arrive at the station.'),
    names:Array.from({length:people},(_,i)=>'Name '+i),speakers:Array.from({length:count},(_,i)=>i%people),sections:roles};
  return JSON.stringify({title:'Travel',teaser:[targets[0]+':1','。'],chapters:[chapter]});
}

test('a reached score unlocks preparation without character encounters and reports completed passages',async t=>{
  const {db}=await testStore();
  const chars=catalog.libraryItems('character',1);
  for(const kind of ['character','word'] as const)
    for(const {text} of catalog.libraryItems(kind,1))await setStrength(db,kind,text,'green');
  await setStrength(db,'character',chars[0].text,'gray');
  const progress=await milestoneProgress(db);
  assert.equal(progress.milestone,1);
  assert(progress.level<1);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM milestone_characters').get())!.n,0);
  await assert.rejects(generateTest(db,2,passages),/requirements/);
  let resume!:()=>void;
  const paused=new Promise<void>(resolve=>{resume=resolve;});
  let started!:()=>void;
  const second=new Promise<void>(resolve=>{started=resolve;});
  let chapters=0,challengedName=false,repairedName=false;
  const job=generateTest(db,1,async prompt=>{
    if(prompt.startsWith('Write simplified Mandarin')&&++chapters===2){started();await paused;}
    const draft=await passages(prompt);
    if(!challengedName&&prompt.includes('natural Mandarin messaging conversation')){
      challengedName=true;
      const story=JSON.parse(draft);
      story.chapters[0].names[0]='龍';
      return JSON.stringify(story);
    }
    if(prompt.includes('Validation feedback: Use speaker names')){
      repairedName=true;
      return JSON.stringify(JSON.parse(draft).chapters[0]);
    }
    return draft;
  });
  await second;
  assert.equal((await preparation(db,1)).completed,1);
  assert.equal((await preparation(db,1)).total,5);
  resume();
  const id=await job;
  assert(repairedName,'An out-of-level speaker name must be revised before the test is ready.');
  assert.equal((await preparation(db,1)).attempt?.id,id);
  assert.equal(progress.passed,0);
});

test('a milestone attempt resumes, grades matching pairs, retries and passes without learning evidence',async t=>{
  const {db}=await testStore();
  await db.prepare('UPDATE milestone_progress SET reached=2').run();
  for(const level of [1,2])for(const {text} of catalog.libraryItems('character',level))await seeItem(db,text,1);
  const evidence=async ()=>await Promise.all(['reading_strength','score_changes','item_encounters','milestone_characters'].map(async table=>
    await db.prepare('SELECT * FROM '+table+' AS evidence ORDER BY to_jsonb(evidence)::text').all()));
  await milestoneProgress(db);
  const before=await evidence();
  await assert.rejects(generateTest(db,1,async()=>'[]'),/exactly 1 chapters/);
  const [id,duplicate]=await Promise.all([generateTest(db,1,passages),generateTest(db,1,passages)]);
  assert.equal(id,duplicate);
  const intro=await testView(db,id);
  assert.equal(intro.status,'ready');
  assert.equal(intro.sections.length,10);
  assert.deepEqual(intro.sections.filter(s=>s.kind!=='Practice').map(s=>s.kind),['Book','Dialogue','Article','Book','Dialogue']);
  const wordPractice=intro.sections.filter(s=>s.kind==='Practice');
  assert.equal(wordPractice.length,5);
  for(const section of wordPractice)assert.equal(section.tasks.length,5);
  assert.equal(intro.sections.reduce((n,s)=>n+s.tasks.length,0),35);

  assert.equal(intro.sections[0].lines.length,3);
  assert(intro.sections[0].lines[0].tokens?.every(t=>!('meaning' in t)));
  assert.equal(intro.sections.find(s=>s.kind==='Dialogue')?.speakers?.length,14);
  for(const section of intro.sections){
    assert(catalog.usesCharactersThrough(JSON.stringify(section),1));
    if(section.kind==='Dialogue')assert.equal(section.names?.length,2);
    if(section.kind==='Article')assert.deepEqual(section.sections,['greeting','body','body','body','signature']);
  }
  assert.equal((await db.prepare('SELECT count(*) AS n FROM stories').get())!.n,1);

  async function run(id:string,readingMistakes:number,practiceMistakes:number){
    const sections=JSON.parse(String((await db.prepare('SELECT sections FROM milestone_tests WHERE id=$1').get(id))!.sections));
    const view=await startTest(db,id);
    assert.equal(view.position,-1);
    await saveDraft(db,id,0,0,[0]);
    await saveDraft(db,id,-1);
    assert.equal((await testView(db,id)).position,-1);
    assert.deepEqual((await testView(db,id)).answers[0].answers,[0]);
    for(let section=sections.length-1;section>=0;section--){
      const s=sections[section];
      for(const task of view.sections[section].tasks.keys()){
        const e=s.exercises[task];
        const answers=e?e.targets.map((item:{meaning:string})=>e.options.indexOf(item.meaning)):[s.questions[task].correct];
        if(!e&&readingMistakes>0){
          answers[0]=(answers[0]+1)%s.questions[task].choices.length;
          readingMistakes--;
        }else if(e?.type==='match'&&practiceMistakes>=2){
          [answers[0],answers[1]]=[answers[1],answers[0]];
          practiceMistakes-=2;
        }else if(e?.type==='choice'&&practiceMistakes%2===1){
          answers[0]=(answers[0]+1)%e.options.length;
          practiceMistakes--;
        }
        await saveDraft(db,id,section,task,answers);
      }
    }
    assert.equal((await testView(db,id)).position,0);
    assert(!('mistakes' in await testView(db,id)));
    const result=await submitTest(db,id);
    assert.deepEqual(await submitTest(db,id),result);
    return result;
  }
  const failed=await run(id,2,4);
  assert.equal(failed.status,'failed');
  assert.equal(failed.reading.mistakes,2);
  assert.equal(failed.practice.mistakes,4);
  const readingFailure=await run(await generateTest(db,1,passages),4,2);
  assert.equal(readingFailure.status,'failed');
  assert.equal(readingFailure.reading.mistakes,4);
  assert.equal(readingFailure.practice.mistakes,2);
  const retry=await generateTest(db,1,passages);
  assert.notEqual(id,retry);
  const passed=await run(retry,3,3);
  assert.equal(passed.status,'passed');
  assert.equal(passed.mistakes,6);
  assert.equal(passed.reading.mistakes,3);
  assert.equal(passed.practice.mistakes,3);
  assert.equal((await milestoneProgress(db)).milestone,2);
  await discardTest(db,retry);
  assert.equal((await milestoneProgress(db)).passed,1);
  await prepareMilestones(db,passages);
  const [retake,nextLevel]=await Promise.all([generateTest(db,1,passages),generateTest(db,2,passages)]);
  assert.notEqual(retake,nextLevel);
  assert.equal((await preparation(db,2)).attempt?.id,nextLevel);
  assert.equal((await startTest(db,retake)).practiceRetake,true);
  await saveDraft(db,retake,0,0,[1]);
  await saveDraft(db,retake,0,0,[0]);
  assert.deepEqual((await testView(db,retake)).answers[0].answers,[0]);
  const blank=await submitTest(db,retake);
  assert.equal(blank.status,'failed');
  assert.equal(blank.mistakes,0);
  assert(blank.unanswered>0);
  assert.equal((await milestoneProgress(db)).passed,1);
  assert.deepEqual(await evidence(),before);
});

test('dashboard and Progression share a capped score and attempt while formats follow earned progress',async t=>{
  const store=await testStore();
  const {db}=store;
  for(const level of [1,2])for(const kind of ['character','word'] as const){
    for(const {text} of catalog.libraryItems(kind,level)){
      await setStrength(db,kind,text,'green');
      await seeItem(db,text,1);
    }
  }
  const id=await generateTest(db,1,passages);
  const server=await createApp(store.db.pool);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const base='http://127.0.0.1:'+server.address()!.port+'/api/';
  const get=async(path:string)=>(await store.fetch(base+path)).json();
  const home=await get('reading-progress'),progression=await get('progression');
  assert.equal(home.level,1);
  assert.equal(home.attempt.id,id);
  assert.deepEqual(home.attempt,progression.attempt);
  assert.equal(progression.level,1);
  assert(progression.groups.flatMap(group=>group.cards).some(card=>card.threshold===2&&card.unlocked));
  const path='milestone-tests/'+id;
  assert.equal((await get(path)).status,'ready');
  await store.fetch(base+path+'/start',{method:'POST'});
  const active=await get(path);
  assert.equal(active.status,'active');
  assert.equal(active.sections[0].tasks[0].correct,undefined);
  assert.equal(active.sections[0].tasks[0].explanation,undefined);
});
