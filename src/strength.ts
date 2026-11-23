import type { DatabaseSync, StatementSync } from 'node:sqlite';
import {catalog,entryKind,type ItemKind} from './catalog.ts';

const statements = new WeakMap<DatabaseSync, {read: StatementSync; adjust: StatementSync; log:StatementSync}>();
function strengthStatements(db: DatabaseSync) {
  const existing = statements.get(db);
  if (existing) return existing;
  db.exec(`CREATE TABLE IF NOT EXISTS reading_strength (
    kind TEXT NOT NULL, text TEXT NOT NULL, score INTEGER NOT NULL,
    PRIMARY KEY (kind,text)
  )`);
  const prepared = {
    log: db.prepare('INSERT INTO score_changes(kind,text,before_score,after_score,at,manual) VALUES(?,?,?,?,?,?)'),
    read: db.prepare('SELECT score FROM reading_strength WHERE kind=? AND text=?'),
    adjust: db.prepare(`INSERT INTO reading_strength(kind,text,score) VALUES(?,?,min(12,max(-6,?)))
      ON CONFLICT(kind,text) DO UPDATE SET score=min(12,max(-6,reading_strength.score+excluded.score))
      RETURNING score`),
  };
  statements.set(db, prepared);
  return prepared;
}

function strength(score: number | null) {
  const color = score === null ? 'gray' : score < 0 ? 'red' : score >= 6 ? 'green' : 'yellow';
  return {score, color};
}
export const statusScores={gray:null,red:-3,yellow:1,green:6} as const;
function changeStrength(db:DatabaseSync,kind:ItemKind,text:string,manual:boolean,now:number,write:(before:number|null)=>number|null){
  kind=entryKind(kind,text);
  const own=!db.isTransaction;
  if(own)db.exec('BEGIN IMMEDIATE');
  try{
    const before=strengthFor(db,kind,text).score;
    const after=write(before);
    if((before??0)!==(after??0))strengthStatements(db).log.run(kind,text,before??0,after??0,now,Number(manual));
    if(own)db.exec('COMMIT');
    return strength(after);
  }catch(error){if(own)db.exec('ROLLBACK');throw error;}
}
export function setStrength(db:DatabaseSync,kind:ItemKind,text:string,color:keyof typeof statusScores){
  kind=entryKind(kind,text);
  return changeStrength(db,kind,text,true,Date.now(),before=>{
    if(strength(before).color===color)return before;
    const score=statusScores[color];
    if(score===null)db.prepare('DELETE FROM reading_strength WHERE kind=? AND text=?').run(kind,text);
    else db.prepare('INSERT INTO reading_strength VALUES(?,?,?) ON CONFLICT(kind,text) DO UPDATE SET score=excluded.score').run(kind,text,score);
    return score;
  });
}
export function strengthFor(db: DatabaseSync, kind: ItemKind, text: string) {
  const row = strengthStatements(db).read.get(entryKind(kind,text),text);
  return strength(row ? Number(row.score) : null);
}
export function adjustStrength(db: DatabaseSync, kind: ItemKind, text: string, delta: number,now=Date.now()) {
  kind=entryKind(kind,text);
  return changeStrength(db,kind,text,false,now,()=>Number(strengthStatements(db).adjust.get(kind,text,delta)!.score));
}

// Called inside the same transaction as the reading action. Only the actual
// change after clamping belongs to this story, even if other stories are open.
export function adjustStoryStrength(db:DatabaseSync,id:string,text:string,delta:number,now=Date.now()){
  if(entryKind('word',text)==='word')return adjustStrength(db,'word',text,delta,now);
  const before=strengthFor(db,'character',text).score??0;
  const after=adjustStrength(db,'character',text,delta,now);
  db.prepare(`INSERT INTO story_character_points(story_id,character,points)
    SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM story_completions WHERE story_id=?)
    ON CONFLICT(story_id,character) DO UPDATE SET points=points+excluded.points`).run(id,text,after.score!-before,id);
  return after;
}

export function recordedStrengths(db: DatabaseSync) {
  strengthStatements(db);
  return db.prepare('SELECT kind,text,score FROM reading_strength').all().map(row=>({
    kind:row.kind as ItemKind, text:String(row.text), score:Number(row.score),
  }));
}

const curriculumBands=Array.from({length:6},(_,i)=>({
  character:new Set(catalog.libraryItems('character',i+1).map(item=>item.text)),
  word:new Set(catalog.libraryItems('word',i+1).map(item=>item.text))
}));

export function hskReadingProgress(db:DatabaseSync, projected=new Map<string,number>()){
  const earned=curriculumBands.map(()=>0);
  const scores=recordedStrengths(db).filter(item=>!projected.has(item.text));
  for(const [text,score] of projected)scores.push({kind:entryKind('word',text),text,score});
  for(const {kind,text,score} of scores){
    const band=curriculumBands.findIndex(items=>items[kind].has(text));
    if(band>=0)earned[band]+=Math.max(0,Math.min(statusScores.green,score));
  }
  return curriculumBands.reduce((sum,band,i)=>
    sum+earned[i]/((band.character.size+band.word.size)*statusScores.green),0);
}
