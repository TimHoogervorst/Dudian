import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {catalog, type ItemKind} from './catalog.ts';
import {HttpError} from './store.ts';
import {strengthFor,adjustStrength} from './strength.ts';

type DeckRequest = {kind: ItemKind; level?: number; words?: string[]};
export function flashcardHistory(db: DatabaseSync) {
  ensureSchema(db);
  return db.prepare(`SELECT kind,text,count(*) AS count,max(graded_at) AS at
    FROM flashcard_reviews GROUP BY kind,text`).all().map(r=>({
      kind:r.kind as ItemKind,text:String(r.text),count:Number(r.count),at:Number(r.at),
    }));
}
function ensureSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS flashcard_sessions(
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, deck TEXT NOT NULL, cursor INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS flashcard_reviews(
    session_id TEXT NOT NULL REFERENCES flashcard_sessions(id), card_index INTEGER NOT NULL,
    kind TEXT NOT NULL, text TEXT NOT NULL, grade TEXT NOT NULL, graded_at INTEGER NOT NULL,
    PRIMARY KEY(session_id,card_index)
  );
  CREATE INDEX IF NOT EXISTS flashcard_review_recency ON flashcard_reviews(kind,text,graded_at)`);
}
function chooseDeck(db: DatabaseSync, {kind,level=1,words}: DeckRequest) {
  if (!['word','character'].includes(kind)) throw new HttpError(400,'Choose a word or character deck.');
  if (words!==undefined) {
    if (kind!=='word' || !Array.isArray(words) || !words.length || words.some(w=>typeof w!=='string' || !catalog.get('word',w))) {
      throw new HttpError(400,'Choose valid words for review.');
    }
    return [...new Set(words)].slice(0,10);
  }
  if (!Number.isInteger(level) || level<1 || level>6) throw new HttpError(400,'Choose HSK 1 through 6.');
  const items = catalog.list(kind,level).map(({text})=>({
    text, score: strengthFor(db,kind,text).score, shuffle: Math.random(),
  })).sort((a,b)=>a.shuffle-b.shuffle);
  const weak = items.filter(i=>i.score!==null && i.score<6).sort((a,b)=>a.score!-b.score!);
  const strong = items.filter(i=>i.score!==null && i.score>=6);
  const unseen = items.filter(i=>i.score===null);
  const first = [...weak.slice(0,7),...strong.slice(0,2)];
  const remaining = [...unseen,...weak.slice(7),...strong.slice(2)];
  return [...first,...remaining].slice(0,10).sort((a,b)=>a.shuffle-b.shuffle).map(i=>i.text);
}
export function startSession(db: DatabaseSync, request: DeckRequest) {
  ensureSchema(db);
  const deck = chooseDeck(db,request);
  const id = randomUUID();
  db.prepare('INSERT INTO flashcard_sessions(id,kind,deck) VALUES(?,?,?)').run(id,request.kind,JSON.stringify(deck));
  return readSession(db,id);
}
export function readSession(db: DatabaseSync,id: string) {
  ensureSchema(db);
  const row = db.prepare('SELECT kind,deck,cursor FROM flashcard_sessions WHERE id=?').get(id);
  if (!row) throw new HttpError(404,'Review session not found.');
  const kind = row.kind as ItemKind;
  const deck: string[] = JSON.parse(String(row.deck));
  const index = Number(row.cursor);
  const entry = index<deck.length ? catalog.get(kind,deck[index]) : undefined;
  return {id,kind,index,total:deck.length,card:entry ? {text:entry.text,senses:entry.senses} : null};
}

export function gradeCard(db: DatabaseSync,id: string,index: number,grade: string,now=Date.now()) {
  if (!['incorrect','almost','correct'].includes(grade) || !Number.isInteger(index) || index<0) {
    throw new HttpError(400,'Choose a recall grade for the displayed card.');
  }
  ensureSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const session = readSession(db,id);
    if (session.index===index && session.card) {
      const {kind,card:{text}} = session;
      const previous = db.prepare('SELECT MAX(graded_at) AS last FROM flashcard_reviews WHERE kind=? AND text=?').get(kind,text);
      const first = previous?.last == null;
      const anotherDay = !first && Math.floor(now/86400000)>Math.floor(Number(previous.last)/86400000);
      const strength = strengthFor(db,kind,text);
      let delta: number;
      if (grade==='correct') delta = anotherDay ? 4 : first ? 3 : 2;
      else if (grade==='incorrect') delta = -3;
      else delta = strength.score===null || strength.score<0 ? 1 : strength.score>=6 ? -1 : 0;
      adjustStrength(db,kind,text,delta);
      db.prepare('INSERT INTO flashcard_reviews VALUES(?,?,?,?,?,?)').run(id,index,kind,text,grade,now);
      db.prepare('UPDATE flashcard_sessions SET cursor=cursor+1 WHERE id=?').run(id);
    } else {
      const existing = db.prepare('SELECT grade FROM flashcard_reviews WHERE session_id=? AND card_index=?').get(id,index);
      if (existing?.grade!==grade) throw new HttpError(409,'This review has moved to a different card. Reopen the session.');
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return readSession(db,id);
}
