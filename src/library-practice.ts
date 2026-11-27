import { randomUUID } from 'node:crypto';
import type { LearnerDatabase } from './postgres/learner-database.ts';
import { readSession,recordReview } from './flashcards.ts';
import { candidates,checkExercise,exerciseView,planExercises,type Exercise,type PracticeRequest } from './practice-exercises.ts';
import { HttpError } from './store.ts';
import { strengthFor,adjustStrength } from './strength.ts';
import { seeItem } from './encounters.ts';

async function load(db:LearnerDatabase,id:string){

  const row=await db.prepare('SELECT * FROM practice_sets WHERE id=$1').get(id);
  if(!row)throw new HttpError(404,'Practice set not found.');
  return {id,request:JSON.parse(String(row.request)) as PracticeRequest,exercises:JSON.parse(String(row.exercises)) as Exercise[],
    excluded:JSON.parse(String(row.excluded)) as string[],answers:JSON.parse(String(row.answers)) as number[][]};
}
async function insert(db:LearnerDatabase,request:PracticeRequest,excluded:string[],parent:string|null){
  const exercises=await planExercises(db,request,excluded,parent!==null);
  const id=randomUUID();
  // The history table shares its session identity with saved flashcard reviews.
  await db.prepare("INSERT INTO flashcard_sessions(id,kind,deck) VALUES($1,$2,'[]')").run(id,request.kind);
  await db.prepare('INSERT INTO practice_sets(id,request,exercises,excluded,parent) VALUES($1,$2,$3,$4,$5)')
    .run(id,JSON.stringify(request),JSON.stringify(exercises),JSON.stringify(excluded),parent);
  return await practiceView(db,id);
}

export function startPractice(db:LearnerDatabase,request:PracticeRequest){

  return db.transaction(async ()=>await insert(db,request,[],null));
}
function visited(set:Awaited<ReturnType<typeof load>>){
  return [...set.excluded,...set.exercises.flatMap(ex=>ex.targets.map(t=>t.text))];
}
export async function practiceView(db:LearnerDatabase,id:string){
  const set=await load(db,id);
  const index=set.answers.length;
  const current=set.exercises[index];
  const exercise=current?await exerciseView(db,current):null;
  const remainingDue=!current&&!set.request.words?(await candidates(db,set.request.level??1,visited(set)))
    .filter(i=>Number.isFinite(i.due)&&(set.request.kind==='mixed'||set.request.kind===(Array.from(i.text).length===1?'character':'word'))).length:0;
  const testedTargets=current?[]:set.exercises.flatMap(ex=>ex.targets);
  return {id,index,total:set.exercises.length,kind:set.request.kind,exercise,remainingDue,
    results:current?undefined:(await readSession(db,id)).results?.map((row,i)=>({...row,pinyin:testedTargets[i].pinyin}))};
}
export function extendPractice(db:LearnerDatabase,id:string){
  return db.transaction(async ()=>{
    const parent=await load(db,id);
    const child=await db.prepare('SELECT id FROM practice_sets WHERE parent=$1').get(id);
    if(child)return await practiceView(db,String(child.id));
    if(parent.request.words||parent.answers.length!==parent.exercises.length||!(await practiceView(db,id)).remainingDue)
      throw new HttpError(409,'No further overdue items in this set.');
    return await insert(db,parent.request,visited(parent),id);
  });
}
export function submitPractice(db:LearnerDatabase,id:string,index:number,answers:number[],zone='UTC'){
  return db.transaction(async ()=>{
    const set=await load(db,id);
    const exercise=set.exercises[index];
    if(!Number.isInteger(index)||!exercise||index>set.answers.length)throw new HttpError(409,'Reopen the current exercise.');
    const feedback=checkExercise(exercise,answers);
    if(set.answers[index]){
      if(JSON.stringify(set.answers[index])!==JSON.stringify(answers))throw new HttpError(409,'This exercise has already been checked.');
    }else{
      try{new Intl.DateTimeFormat('sv-SE',{timeZone:zone});}
      catch{throw new HttpError(400,'Unknown time zone.');}
      const offset=set.answers.reduce((sum,row)=>sum+row.length,0);
      const now=Date.now();
      for (const [i,{kind,text}] of exercise.targets.entries()) {
        const correct=feedback[i].correct;
        const before=(await strengthFor(db,kind,text)).score??0;
        await seeItem(db,text,now,true);
        const after=await adjustStrength(db,kind,text,correct?0.5:-0.5,now);
        await recordReview(db,id,offset+i,kind,text,correct?'correct':'incorrect',now,(after.score??0)-before);
      }
      set.answers.push(answers);
      await db.prepare('UPDATE practice_sets SET answers=$1 WHERE id=$2').run(JSON.stringify(set.answers),id);
    }
    return {feedback,next:await practiceView(db,id)};
  });
}
