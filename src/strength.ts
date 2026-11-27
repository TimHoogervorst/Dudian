import type { LearnerDatabase,Statement } from './postgres/learner-database.ts';
import { catalog,entryKind,type ItemKind } from './catalog.ts';
import { encounterFor,perfectScore,seeItem } from './encounters.ts';

const statements = new WeakMap<LearnerDatabase, {read: Statement; adjust: Statement; log:Statement}>();
function strengthStatements(db: LearnerDatabase) {
  const existing = statements.get(db);
  if (existing) return existing;

  const prepared = {
    log: db.prepare('INSERT INTO score_changes(kind,text,before_score,after_score,at,manual) VALUES($1,$2,$3,$4,$5,$6)'),
    read: db.prepare('SELECT score FROM reading_strength WHERE kind=$1 AND text=$2'),
    adjust: db.prepare(`INSERT INTO reading_strength(kind,text,score) VALUES($1,$2,least(${perfectScore},greatest(-6,$3::numeric)))
      ON CONFLICT(account_id,kind,text) DO UPDATE SET score=least(${perfectScore},greatest(-6,round(reading_strength.score+$4,3)))
      RETURNING score`),
  };
  statements.set(db, prepared);
  return prepared;
}

export function strength(score: number | null) {
  const color = score === null ? 'gray' : score < 0 ? 'red' : score >= perfectScore ? 'gold' : score >= 6 ? 'green' : 'yellow';
  return {score, color};
}
export const statusScores={gray:null,red:-3,yellow:1,green:6,gold:perfectScore} as const;
async function changeStrength(db:LearnerDatabase,kind:ItemKind,text:string,manual:boolean,now:number,write:(before:number|null)=>Promise<number|null>){
  kind=entryKind(kind,text);
  return await db.transaction(async () => {
    const before=(await strengthFor(db,kind,text)).score;
    const after=await write(before);
    if((before??0)!==(after??0))await strengthStatements(db).log.run(kind,text,before??0,after??0,now,Number(manual));

    return strength(after);
  });
}
export async function setStrength(db:LearnerDatabase,kind:ItemKind,text:string,color:keyof typeof statusScores){
  kind=entryKind(kind,text);
  return await changeStrength(db,kind,text,true,Date.now(),async before=>{
    if(strength(before).color===color)return before;
    const score=statusScores[color];
    if(score===null){
      await db.prepare('DELETE FROM reading_strength WHERE kind=$1 AND text=$2').run(kind,text);
      await db.prepare('DELETE FROM item_encounters WHERE text=$1').run(text);
    }
    else await db.prepare('INSERT INTO reading_strength(kind,text,score) VALUES($1,$2,$3) ON CONFLICT(account_id,kind,text) DO UPDATE SET score=excluded.score').run(kind,text,score);
    if(score!==null)await seeItem(db,text,Date.now(),true,false);
    return score;
  });
}
export async function strengthFor(db: LearnerDatabase, kind: ItemKind, text: string) {
  const row = await strengthStatements(db).read.get(entryKind(kind,text),text);
  return strength(row ? Number(row.score) : null);
}
export async function adjustStrength(db: LearnerDatabase, kind: ItemKind, text: string, delta: number,now=Date.now()) {
  kind=entryKind(kind,text);
  return await changeStrength(db,kind,text,false,now,async before=>before===perfectScore?before:Number((await strengthStatements(db).adjust.get(kind,text,delta,delta))!.score));
}

export type Evidence='appearance'|'correct'|'incorrect'|'assisted';
// Call inside the transaction recording the attempt so retries cannot settle it twice.
export async function encounterPoints(db:LearnerDatabase,text:string,delta:number,now:number,evidence:Evidence){
  const {dueAt}=await encounterFor(db,text);
  const overdue=dueAt!==null && dueAt<=now;
  await seeItem(db,text,now,evidence==='correct'||evidence==='incorrect');
  if(!overdue)return delta;
  return evidence==='incorrect'?2*delta:0;
}
export async function scoreEncounter(db:LearnerDatabase,kind:ItemKind,text:string,delta:number,now:number,evidence:Evidence){
  const points=await encounterPoints(db,text,delta,now,evidence);
  if(points===0)return await strengthFor(db,kind,text);
  return await adjustStrength(db,kind,text,points,now);
}

export async function recordedStrengths(db: LearnerDatabase) {
  strengthStatements(db);
  return (await db.prepare('SELECT kind,text,score FROM reading_strength').all()).map(row=>({
    kind:row.kind as ItemKind, text:String(row.text), score:Number(row.score),
  }));
}

// A lookup can establish an encounter before an item earns its first point.
export async function reviewCandidates(db:LearnerDatabase,now:number){
  strengthStatements(db);
  const rows=await db.prepare(`SELECT text,score,due_at FROM reading_strength LEFT JOIN item_encounters USING(text)
    UNION ALL SELECT text,0,due_at FROM item_encounters LEFT JOIN reading_strength USING(text)
    WHERE score IS NULL AND due_at<=$1`).all(now);
  return rows.map(row=>({text:String(row.text),kind:entryKind('word',String(row.text)),score:Number(row.score),
    dueAt:row.due_at===null?Infinity:Number(row.due_at)}));
}

const curriculumBands=Array.from({length:6},(_,i)=>({
  character:new Set(catalog.libraryItems('character',i+1).map(item=>item.text)),
  word:new Set(catalog.libraryItems('word',i+1).map(item=>item.text))
}));

export async function hskReadingProgress(db:LearnerDatabase, projected=new Map<string,number>()){
  const earned=curriculumBands.map(()=>0);
  const scores=(await recordedStrengths(db)).filter(item=>!projected.has(item.text));
  for(const [text,score] of projected)scores.push({kind:entryKind('word',text),text,score});
  for(const {kind,text,score} of scores){
    const band=curriculumBands.findIndex(items=>items[kind].has(text));
    if(band>=0)earned[band]+=Math.max(0,Math.min(statusScores.green,score));
  }
  return curriculumBands.reduce((sum,band,i)=>
    sum+earned[i]/((band.character.size+band.word.size)*statusScores.green),0);
}

// Recover thresholds crossed between visits, including on an upgraded database.
export async function reachedLevel(db:LearnerDatabase,current:number){
  const state=(await db.prepare('SELECT reached,last_change FROM milestone_progress WHERE id=1').get())!;
  let peak=current, cursor=current, last=Number(state.last_change);
  for(const row of await db.prepare('SELECT rowid,* FROM score_changes WHERE rowid>$1 ORDER BY rowid DESC').all(last)){
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
  await db.prepare('UPDATE milestone_progress SET reached=greatest(reached,$1),last_change=greatest(last_change,$2) WHERE id=1').run(reached,last);
  return reached;
}
