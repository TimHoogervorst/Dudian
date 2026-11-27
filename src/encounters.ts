import type { LearnerDatabase } from './postgres/learner-database.ts';
import type { QuizText } from './store.ts';

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

export async function encounterFor(db:LearnerDatabase,text:string){
  const row=await db.prepare('SELECT last_seen,due_at FROM item_encounters WHERE text=$1').get(text);
  return {lastSeen:row?Number(row.last_seen):null,dueAt:row?Number(row.due_at):null};
}

export async function seeItem(db:LearnerDatabase,text:string,now:number,settled=false,creditCoverage=true){
  if(creditCoverage){
    const insert=db.prepare('INSERT INTO milestone_characters(text) VALUES($1) ON CONFLICT DO NOTHING');
    for(const char of text)if(/\p{Script=Han}/u.test(char))await insert.run(char);
  }
  await db.prepare(`INSERT INTO item_encounters(text,last_seen,due_at) VALUES($1,$2,$3)
    ON CONFLICT(account_id,text) DO UPDATE SET last_seen=greatest(item_encounters.last_seen,excluded.last_seen),
    due_at=CASE WHEN excluded.last_seen>=item_encounters.last_seen AND ($4::integer<>0 OR item_encounters.due_at>excluded.last_seen)
      THEN excluded.due_at ELSE item_encounters.due_at END`).run(text,now,now+week,Number(settled));
}
