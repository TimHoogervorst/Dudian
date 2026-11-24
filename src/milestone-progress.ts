import type {DatabaseSync} from 'node:sqlite';
import {catalog} from './catalog.ts';
import {hskReadingProgress,reachedLevel} from './strength.ts';

export function nextTestLevel(db:DatabaseSync){
  return Number(db.prepare("SELECT coalesce(max(level),0)+1 AS level FROM milestone_tests WHERE status='passed'").get()!.level);
}

export function unseenCharacters(db:DatabaseSync,level:number){
  const seen=new Set(db.prepare('SELECT text FROM milestone_characters').all().map(row=>row.text));
  return catalog.libraryItems('character',level).map(item=>item.text).filter(text=>!seen.has(text));
}

export function milestoneProgress(db:DatabaseSync,raw=hskReadingProgress(db)){
  const level=nextTestLevel(db);
  const reached=reachedLevel(db,raw);
  const milestone=level<=reached?level:null;
  const attempt=milestone?db.prepare('SELECT id,status FROM milestone_tests WHERE level=? ORDER BY rowid DESC LIMIT 1').get(level):null;
  return {level:Math.min(raw,level),passed:level-1,milestone,
    missing:milestone?unseenCharacters(db,level):[],attempt};
}
