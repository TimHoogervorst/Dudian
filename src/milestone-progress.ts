import type {DatabaseSync} from 'node:sqlite';
import {catalog} from './catalog.ts';
import {hskReadingProgress,reachedLevel} from './strength.ts';

// Fraction of the level completed, desired character coverage, minimum selection probability.
const coverageCheckpoints=[
  [0.30,0.20,0.30], [0.50,0.40,0.50], [0.60,0.55,0.60],
  [0.70,0.75,0.75], [0.80,0.90,0.90], [0.90,1,1],
] as const;

export function unseenFocusChance(progress:number,coverage:number){
  if(progress<coverageCheckpoints[0][0]||coverage>=1)return 0;
  for(let i=1;i<coverageCheckpoints.length;i++){
    const [end,target,chance]=coverageCheckpoints[i];
    if(progress>end)continue;
    const [start,previousTarget,previousChance]=coverageCheckpoints[i-1];
    const fraction=(progress-start)/(end-start);
    const desired=previousTarget+fraction*(target-previousTarget);
    return coverage+1e-12<desired?previousChance+fraction*(chance-previousChance):0;
  }
  return 1;
}

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
