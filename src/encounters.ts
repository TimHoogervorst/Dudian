import type {DatabaseSync} from 'node:sqlite';
import type {QuizText,Story} from './store.ts';

const week=7*86_400_000;
export const perfectScore=36;

export function questionWords(part:QuizText){
  return part.words?.filter(w=>w!=='包包')??Array.from(part.zh.replaceAll('包包',''));
}

export function readingItems(words:Iterable<string>){
  const items=new Set<string>();
  for(const word of words){
    const characters=Array.from(word).filter(c=>/\p{Script=Han}/u.test(c));
    if(!characters.length)continue;
    items.add(word);
    for(const char of characters)items.add(char);
  }
  return items;
}

// Runs inside the store's upgrade transaction. Older databases have different
// subsets of the activity tables depending on which features were used.
export function migrateEncounters(db:DatabaseSync){
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  if(exists.get('item_encounters'))return;
  db.exec('CREATE TABLE item_encounters(text TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,due_at INTEGER NOT NULL)');
  const latest=new Map<string,number>();
  function remember(items:Iterable<string>,at:number){
    for(const item of items)latest.set(item,Math.max(at,latest.get(item)??0));
  }
  if(exists.get('chapter_completions')){
    for(const row of db.prepare('SELECT content,chapter,at FROM chapter_completions JOIN stories ON stories.id=story_id').iterate()){
      const chapter=(JSON.parse(String(row.content)) as Story).chapters[Number(row.chapter)];
      if(chapter)remember(readingItems(chapter.paragraphs.flat().filter(t=>!t.cast).map(t=>t.text)),Number(row.at));
    }
  }
  if(exists.get('word_actions'))for(const row of db.prepare('SELECT word,max(at) AS at FROM word_actions GROUP BY word').iterate())
    remember(readingItems([String(row.word)]),Number(row.at));
  if(exists.get('flashcard_reviews'))for(const row of db.prepare('SELECT text,max(graded_at) AS at FROM flashcard_reviews GROUP BY text').iterate())
    remember(readingItems([String(row.text)]),Number(row.at));
  for(const row of db.prepare('SELECT text,max(at) AS at FROM score_changes WHERE manual=0 GROUP BY text').iterate())
    remember([String(row.text)],Number(row.at));
  const now=Date.now();
  if(exists.get('reading_strength'))for(const row of db.prepare('SELECT text FROM reading_strength').iterate()){
    const text=String(row.text);
    if(!latest.has(text))latest.set(text,now);
  }
  const insert=db.prepare('INSERT INTO item_encounters VALUES(?,?,?)');
  for(const [text,at] of latest)insert.run(text,at,at+week);
}

export function encounterFor(db:DatabaseSync,text:string){
  const row=db.prepare('SELECT last_seen,due_at FROM item_encounters WHERE text=?').get(text);
  return {lastSeen:row?Number(row.last_seen):null,dueAt:row?Number(row.due_at):null};
}

export function seeItem(db:DatabaseSync,text:string,now:number,settled=false,creditCoverage=true){
  if(creditCoverage){
    const insert=db.prepare('INSERT OR IGNORE INTO milestone_characters VALUES(?)');
    for(const char of text)if(/\p{Script=Han}/u.test(char))insert.run(char);
  }
  db.prepare(`INSERT INTO item_encounters VALUES(?,?,?)
    ON CONFLICT(text) DO UPDATE SET last_seen=max(last_seen,excluded.last_seen),
    due_at=CASE WHEN excluded.last_seen>=last_seen AND (? OR due_at>excluded.last_seen)
      THEN excluded.due_at ELSE due_at END`).run(text,now,now+week,Number(settled));
}
