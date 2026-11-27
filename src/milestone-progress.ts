import type { LearnerDatabase } from './postgres/learner-database.ts';
import { catalog } from './catalog.ts';
import { hskReadingProgress,reachedLevel } from './strength.ts';

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

export async function nextTestLevel(db:LearnerDatabase){
  return Number((await db.prepare("SELECT coalesce(max(level),0)+1 AS level FROM milestone_passes").get())!.level);
}

export async function unseenCharacters(db:LearnerDatabase,level:number){
  const seen=new Set((await db.prepare('SELECT text FROM milestone_characters').all()).map(row=>row.text));
  return catalog.libraryItems('character',level).map(item=>item.text).filter(text=>!seen.has(text));
}

export async function milestoneProgress(db:LearnerDatabase,raw?:number){
  raw ??= await hskReadingProgress(db);
  const level=await nextTestLevel(db);
  const reached=await reachedLevel(db,raw);
  const milestone=level<=reached?level:null;
  const attempt=milestone?await db.prepare("SELECT id,status FROM milestone_tests WHERE level=$1 AND status IN ('ready','active')").get(level):null;
  return {level:Math.min(raw,level),passed:level-1,milestone,attempt};
}
