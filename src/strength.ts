import type { DatabaseSync, StatementSync } from 'node:sqlite';
import {catalog,entryKind,type ItemKind} from './catalog.ts';
import {encounterFor,perfectScore,seeItem} from './encounters.ts';

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
    adjust: db.prepare(`INSERT INTO reading_strength(kind,text,score) VALUES(?,?,min(${perfectScore},max(-6,?)))
      ON CONFLICT(kind,text) DO UPDATE SET score=min(${perfectScore},max(-6,round(reading_strength.score+?,3)))
      RETURNING score`),
  };
  statements.set(db, prepared);
  return prepared;
}

function strength(score: number | null) {
  const color = score === null ? 'gray' : score < 0 ? 'red' : score >= perfectScore ? 'gold' : score >= 6 ? 'green' : 'yellow';
  return {score, color};
}
export const statusScores={gray:null,red:-3,yellow:1,green:6,gold:perfectScore} as const;
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
    if(score===null){
      db.prepare('DELETE FROM reading_strength WHERE kind=? AND text=?').run(kind,text);
      db.prepare('DELETE FROM item_encounters WHERE text=?').run(text);
    }
    else db.prepare('INSERT INTO reading_strength VALUES(?,?,?) ON CONFLICT(kind,text) DO UPDATE SET score=excluded.score').run(kind,text,score);
    if(score!==null)seeItem(db,text,Date.now(),true,false);
    return score;
  });
}
export function strengthFor(db: DatabaseSync, kind: ItemKind, text: string) {
  const row = strengthStatements(db).read.get(entryKind(kind,text),text);
  return strength(row ? Number(row.score) : null);
}
export function adjustStrength(db: DatabaseSync, kind: ItemKind, text: string, delta: number,now=Date.now()) {
  kind=entryKind(kind,text);
  return changeStrength(db,kind,text,false,now,before=>before===perfectScore?before:Number(strengthStatements(db).adjust.get(kind,text,delta,delta)!.score));
}

export type Evidence='appearance'|'correct'|'incorrect'|'assisted';
// Call inside the transaction recording the attempt so retries cannot settle it twice.
export function encounterPoints(db:DatabaseSync,text:string,delta:number,now:number,evidence:Evidence){
  const {dueAt}=encounterFor(db,text);
  const overdue=dueAt!==null && dueAt<=now;
  seeItem(db,text,now,evidence==='correct'||evidence==='incorrect');
  if(!overdue)return delta;
  return evidence==='incorrect'?2*delta:0;
}
export function scoreEncounter(db:DatabaseSync,kind:ItemKind,text:string,delta:number,now:number,evidence:Evidence){
  const points=encounterPoints(db,text,delta,now,evidence);
  if(points===0)return strengthFor(db,kind,text);
  return adjustStrength(db,kind,text,points,now);
}

export function recordedStrengths(db: DatabaseSync) {
  strengthStatements(db);
  return db.prepare('SELECT kind,text,score FROM reading_strength').all().map(row=>({
    kind:row.kind as ItemKind, text:String(row.text), score:Number(row.score),
  }));
}

// A lookup can establish an encounter before an item earns its first point.
export function reviewCandidates(db:DatabaseSync,now:number){
  strengthStatements(db);
  const rows=db.prepare(`SELECT text,score,due_at FROM reading_strength LEFT JOIN item_encounters USING(text)
    UNION ALL SELECT text,0,due_at FROM item_encounters LEFT JOIN reading_strength USING(text)
    WHERE score IS NULL AND due_at<=?`).all(now);
  return rows.map(row=>({text:String(row.text),kind:entryKind('word',String(row.text)),score:Number(row.score),
    dueAt:row.due_at===null?Infinity:Number(row.due_at)}));
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

// Recover thresholds crossed between visits, including on an upgraded database.
export function reachedLevel(db:DatabaseSync,current:number){
  const state=db.prepare('SELECT reached,last_change FROM milestone_progress WHERE id=1').get()!;
  let peak=current, cursor=current, last=Number(state.last_change);
  for(const row of db.prepare('SELECT rowid,* FROM score_changes WHERE rowid>? ORDER BY rowid DESC').iterate(last)){
    last=Math.max(last,Number(row.rowid));
    const kind=row.kind as ItemKind;
    const band=curriculumBands.find(b=>b[kind].has(String(row.text)));
    if(!band)continue;
    const credit=(score:number)=>Math.max(0,Math.min(statusScores.green,score));
    cursor+=(credit(Number(row.before_score))-credit(Number(row.after_score)))/
      ((band.character.size+band.word.size)*statusScores.green);
    peak=Math.max(peak,cursor);
  }
  const reached=Math.max(Number(state.reached),Math.min(6,Math.floor(peak+1e-10)));
  db.prepare('UPDATE milestone_progress SET reached=max(reached,?),last_change=max(last_change,?) WHERE id=1').run(reached,last);
  return reached;
}
