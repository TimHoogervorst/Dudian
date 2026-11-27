import { progression } from '../reading-types.ts';
import { hskReadingProgress } from '../strength.ts';
import { preparation } from '../milestone-test.ts';
import { milestoneProgress } from '../milestone-progress.ts';
import type { Context } from '../server.ts';

export default async function generation({url,req,json,store}:Context) {
  if(url.pathname==='/api/progression' && req.method==='GET'){
    const level=await hskReadingProgress(store.db);
    const progress=await milestoneProgress(store.db,level);
    const retakes=await Promise.all(Array.from({length:progress.passed},async (_,i)=>({level:i+1,...await preparation(store.db,i+1)})));
    const summaries=await store.db.prepare("SELECT id,level,status FROM milestone_tests WHERE status IN ('passed','failed') ORDER BY rowid DESC").all();
    json(200,{...progress,retakes,summaries,groups:progression(level)});
  } else return false;
  return true;
}
