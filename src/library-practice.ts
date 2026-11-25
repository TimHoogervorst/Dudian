import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {ensureReviewSchema,readSession,recordReview} from './flashcards.ts';
import {candidates,checkExercise,exerciseView,planExercises,type Exercise,type PracticeRequest} from './practice-exercises.ts';
import {HttpError} from './store.ts';
import {strengthFor,adjustStrength} from './strength.ts';
import {seeItem} from './encounters.ts';

function schema(db:DatabaseSync){
  ensureReviewSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS practice_sets(
    id TEXT PRIMARY KEY REFERENCES flashcard_sessions(id), request TEXT NOT NULL, exercises TEXT NOT NULL,
    excluded TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '[]', parent TEXT UNIQUE REFERENCES practice_sets(id))`);
}
function load(db:DatabaseSync,id:string){
  schema(db);
  const row=db.prepare('SELECT * FROM practice_sets WHERE id=?').get(id);
  if(!row)throw new HttpError(404,'Practice set not found.');
  return {id,request:JSON.parse(String(row.request)) as PracticeRequest,exercises:JSON.parse(String(row.exercises)) as Exercise[],
    excluded:JSON.parse(String(row.excluded)) as string[],answers:JSON.parse(String(row.answers)) as number[][]};
}
function insert(db:DatabaseSync,request:PracticeRequest,excluded:string[],parent:string|null){
  const exercises=planExercises(db,request,excluded,parent!==null);
  const id=randomUUID();
  // The history table shares its session identity with saved flashcard reviews.
  db.prepare("INSERT INTO flashcard_sessions(id,kind,deck) VALUES(?,?,'[]')").run(id,request.kind);
  db.prepare('INSERT INTO practice_sets(id,request,exercises,excluded,parent) VALUES(?,?,?,?,?)')
    .run(id,JSON.stringify(request),JSON.stringify(exercises),JSON.stringify(excluded),parent);
  return practiceView(db,id);
}
function transaction<T>(db:DatabaseSync,write:()=>T){
  db.exec('BEGIN IMMEDIATE');
  try{const value=write();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
export function startPractice(db:DatabaseSync,request:PracticeRequest){
  schema(db);
  return transaction(db,()=>insert(db,request,[],null));
}
function visited(set:ReturnType<typeof load>){
  return [...set.excluded,...set.exercises.flatMap(ex=>ex.targets.map(t=>t.text))];
}
export function practiceView(db:DatabaseSync,id:string){
  const set=load(db,id);
  const index=set.answers.length;
  const current=set.exercises[index];
  const exercise=current?exerciseView(db,current):null;
  const remainingDue=!current&&!set.request.words?candidates(db,set.request.level??1,visited(set))
    .filter(i=>Number.isFinite(i.due)&&(set.request.kind==='mixed'||set.request.kind===(Array.from(i.text).length===1?'character':'word'))).length:0;
  const testedTargets=current?[]:set.exercises.flatMap(ex=>ex.targets);
  return {id,index,total:set.exercises.length,kind:set.request.kind,exercise,remainingDue,
    results:current?undefined:readSession(db,id).results?.map((row,i)=>({...row,pinyin:testedTargets[i].pinyin}))};
}
export function extendPractice(db:DatabaseSync,id:string){
  return transaction(db,()=>{
    const parent=load(db,id);
    const child=db.prepare('SELECT id FROM practice_sets WHERE parent=?').get(id);
    if(child)return practiceView(db,String(child.id));
    if(parent.request.words||parent.answers.length!==parent.exercises.length||!practiceView(db,id).remainingDue)
      throw new HttpError(409,'No further overdue items in this set.');
    return insert(db,parent.request,visited(parent),id);
  });
}
export function submitPractice(db:DatabaseSync,id:string,index:number,answers:number[],zone='UTC'){
  return transaction(db,()=>{
    const set=load(db,id);
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
      exercise.targets.forEach(({kind,text},i)=>{
        const correct=feedback[i].correct;
        const before=strengthFor(db,kind,text).score??0;
        seeItem(db,text,now,true);
        const after=adjustStrength(db,kind,text,correct?0.5:-0.5,now);
        recordReview(db,id,offset+i,kind,text,correct?'correct':'incorrect',now,(after.score??0)-before);
      });
      set.answers.push(answers);
      db.prepare('UPDATE practice_sets SET answers=? WHERE id=?').run(JSON.stringify(set.answers),id);
    }
    return {feedback,next:practiceView(db,id)};
  });
}
