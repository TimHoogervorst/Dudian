import { randomUUID } from 'node:crypto';
import type { LearnerDatabase } from './postgres/learner-database.ts';
import { catalog,entryKind,type ItemKind } from './catalog.ts';
import { HttpError } from './store.ts';
import { strengthFor,scoreEncounter,reviewCandidates } from './strength.ts';
import { perfectScore,seeItem } from './encounters.ts';

type DeckRequest = {kind: ItemKind|'mixed'; level?: number; words?: string[]};
export async function flashcardHistory(db: LearnerDatabase) {

  return (await db.prepare(`SELECT kind,text,count(*) AS count,max(graded_at) AS at
    FROM flashcard_reviews GROUP BY kind,text`).all()).map(r=>({
      kind:r.kind as ItemKind,text:String(r.text),count:Number(r.count),at:Number(r.at),
    }));
}

async function chooseDeck(db: LearnerDatabase, {kind,level=1,words}: DeckRequest):Promise<string[]> {
  if (!['word','character','mixed'].includes(kind)) throw new HttpError(400,'Choose a valid practice deck.');
  if (words!==undefined) {
    if (kind!=='word' || !Array.isArray(words) || !words.length || words.some(w=>typeof w!=='string' || !catalog.get('word',w))) {
      throw new HttpError(400,'Choose valid words for review.');
    }
    return [...new Set(words)].slice(0,10);
  }
  if (!Number.isInteger(level) || level<1 || level>6) throw new HttpError(400,'Choose HSK 1 through 6.');
  const now=Date.now();
  const scores=new Map((await reviewCandidates(db,now)).map(item=>[item.text,item]));
  function candidates(type:ItemKind){
    return catalog.libraryItems(type,level).map(({text})=>{
      const item=scores.get(text);
      return {text,kind:type,score:item?.score??null,dueAt:item?.dueAt??Infinity,shuffle:Math.random()};
    }).filter(i=>i.score!==perfectScore);
  }
  function oldest(items:ReturnType<typeof candidates>){
    return items.filter(i=>i.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt)[0];
  }
  if(kind==='mixed'){
    const ranked=(type:ItemKind)=>candidates(type).sort((a,b)=>(a.score??5.5)-(b.score??5.5)||a.shuffle-b.shuffle);
    const compounds=ranked('word'),characters=ranked('character');
    const pairedWords=compounds.filter(w=>w.score!==null && w.score<0);
    const wordPicks=new Set<string>(),charPicks=new Set<string>();
    const due=oldest([...compounds,...characters]);
    if(due)(due.kind==='word'?wordPicks:charPicks).add(due.text);
    for(const word of pairedWords){
      const match=Array.from(word.text).find(c=>(scores.get(c)?.score??0)<0);
      if(match && (charPicks.has(match)||charPicks.size<4)) {
        wordPicks.add(word.text);charPicks.add(match);
        if(wordPicks.size===6)break;
      }
    }
    const strongWord=compounds.find(w=>(w.score??0)>=6);
    if(strongWord&&wordPicks.size<6)wordPicks.add(strongWord.text);
    const strongCharacter=characters.find(c=>(c.score??0)>=6);
    if(strongCharacter&&charPicks.size<4)charPicks.add(strongCharacter.text);
    for(const {text} of compounds)if(wordPicks.size<6)wordPicks.add(text);
    for(const {text} of characters)if(charPicks.size<10-wordPicks.size)charPicks.add(text);
    for(const {text} of compounds)if(wordPicks.size+charPicks.size<10)wordPicks.add(text);
    return [...wordPicks,...charPicks].map(text=>({text,shuffle:Math.random()})).sort((a,b)=>a.shuffle-b.shuffle).map(i=>i.text);
  }
  const items=candidates(kind).sort((a,b)=>a.shuffle-b.shuffle);
  const weak = items.filter(i=>i.score!==null && i.score<6).sort((a,b)=>a.score!-b.score!);
  const strong = items.filter(i=>i.score!==null && i.score>=6);
  const unseen = items.filter(i=>i.score===null);
  const first = [...weak.slice(0,7),...strong.slice(0,2)];
  const remaining = [...unseen,...weak.slice(7),...strong.slice(2)];
  const due=oldest(items);
  return [...new Set([...(due?[due]:[]),...first,...remaining])].slice(0,10).sort((a,b)=>a.shuffle-b.shuffle).map(i=>i.text);
}
export async function startSession(db: LearnerDatabase, request: DeckRequest) {

  const deck = await chooseDeck(db,request);
  const id = randomUUID();
  await db.prepare('INSERT INTO flashcard_sessions(id,kind,deck) VALUES($1,$2,$3)').run(id,request.kind,JSON.stringify(deck));
  return await readSession(db,id);
}
export async function readSession(db: LearnerDatabase,id: string) {

  const row = await db.prepare('SELECT kind,deck,cursor FROM flashcard_sessions WHERE id=$1').get(id);
  if (!row) throw new HttpError(404,'Review session not found.');
  const kind = row.kind as DeckRequest['kind'];
  const deck: string[] = JSON.parse(String(row.deck));
  const index = Number(row.cursor);
  const cardKind=entryKind(kind==='mixed'?'word':kind,deck[index]??'');
  const entry = index<deck.length ? catalog.get(cardKind,deck[index]) : undefined;
  const results=index===deck.length?(await db.prepare('SELECT kind,text,grade,points FROM flashcard_reviews WHERE session_id=$1 ORDER BY card_index')
    .all(id)).map(row=>({
      kind:row.kind,text:row.text,grade:row.grade,points:row.points===null?null:Number(row.points),
      pinyin:catalog.get(row.kind as ItemKind,String(row.text))?.senses[0]?.pinyin
    })):undefined;
  return {id,kind,index,total:deck.length,results,card:entry ? {kind:cardKind,text:entry.text,senses:entry.senses} : null};
}

async function gradeRecall(db:LearnerDatabase,kind:ItemKind,text:string,grade:string,now:number,day:Intl.DateTimeFormat){
  const previous = await db.prepare('SELECT MAX(graded_at) AS last FROM flashcard_reviews WHERE kind=$1 AND text=$2').get(kind,text);
  const first = previous?.last == null;
  const anotherDay = !first && day.format(now)>day.format(Number(previous.last));
  const strength = await strengthFor(db,kind,text);
  let delta: number;
  if (grade==='correct') delta = anotherDay ? 4 : first ? 3 : 2;
  else if (grade==='incorrect') delta = -3;
  else delta = strength.score===null || strength.score<0 ? 1 : strength.score>=6 ? -1 : 0;
  const after=await scoreEncounter(db,kind,text,delta,now,grade==='almost'?'assisted':grade==='correct'?'correct':'incorrect');
  return (after.score??0)-(strength.score??0);
}

export async function recordReview(db:LearnerDatabase,id:string,index:number,kind:ItemKind,text:string,grade:string,now:number,change:number){
  if(kind==='word')for(const char of new Set(text))await seeItem(db,char,now);
  const points=Math.round(change*1000)/1000;
  await db.prepare('INSERT INTO flashcard_reviews(session_id,card_index,kind,text,grade,graded_at,points) VALUES($1,$2,$3,$4,$5,$6,$7)').run(id,index,kind,text,grade,now,points);
}

export async function gradeCard(db: LearnerDatabase,id: string,index: number,grade: string,now=Date.now(),zone='UTC') {
  if (!['incorrect','almost','correct'].includes(grade) || !Number.isInteger(index) || index<0) {
    throw new HttpError(400,'Choose a recall grade for the displayed card.');
  }
  let day:Intl.DateTimeFormat;
  try {
    if(typeof zone!=='string')throw new RangeError();
    day=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  } catch { throw new HttpError(400,'Unknown time zone.'); }

  await db.transaction(async () => {
    const session = await readSession(db,id);
    if (session.index===index && session.card) {
      const {kind,text}=session.card;
      const change=await gradeRecall(db,kind,text,grade,now,day);
      await recordReview(db,id,index,kind,text,grade,now,change);
      await db.prepare('UPDATE flashcard_sessions SET cursor=cursor+1 WHERE id=$1').run(id);
    } else {
      const existing = await db.prepare('SELECT grade FROM flashcard_reviews WHERE session_id=$1 AND card_index=$2').get(id,index);
      if (existing?.grade!==grade) throw new HttpError(409,'This review has moved to a different card. Reopen the session.');
    }

  });
  return await readSession(db,id);
}
