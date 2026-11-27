import { progression } from '../reading-types.ts';
import { hskReadingProgress } from '../strength.ts';
import { preparation } from '../milestone-test.ts';
import { milestoneProgress } from '../milestone-progress.ts';
import { practicePreview,confirmedPlan } from '../practice-preview.ts';
import type { Context } from '../server.ts';
import { getPreferences,setPreferences } from '../story-plan.ts';
import { latestGeneration,startGeneration } from '../generation-job.ts';

export default async function generation({url,req,body,json,store}:Context) {
  if(url.pathname==='/api/progression' && req.method==='GET'){
    const level=await hskReadingProgress(store.db);
    const progress=await milestoneProgress(store.db,level);
    const retakes=await Promise.all(Array.from({length:progress.passed},async (_,i)=>({level:i+1,...await preparation(store.db,i+1)})));
    const summaries=await store.db.prepare("SELECT id,level,status FROM milestone_tests WHERE status IN ('passed','failed') ORDER BY rowid DESC").all();
    json(200,{...progress,retakes,summaries,groups:progression(level)});
  } else if (url.pathname === '/api/story-preferences' && req.method==='GET') {
    json(200,await getPreferences(store));
  } else if (url.pathname === '/api/story-preferences' && req.method==='POST') {
    json(200,await setPreferences(store,await body()));
  } else if(url.pathname==='/api/practice-preview' && req.method==='POST'){
    const options=await body();
    json(200,await practicePreview(store,{...options,chapterCount:requestedChapters(options)}));
  } else if (url.pathname === '/api/generate-story' && req.method==='POST') {
    const options = await body();
    const chapterCount=requestedChapters(options);
    const previewId=options?.previewId??(options?.type===undefined?undefined:(await practicePreview(store,{...options,chapterCount})).id);
    const plan=previewId===undefined?undefined:confirmedPlan(store,previewId,options.difficulty,chapterCount,options.subject);
    json(202,await startGeneration(store,options?.difficulty,chapterCount,plan));
  } else if(url.pathname==='/api/generation-job' && req.method==='GET') {
    json(200,await latestGeneration(store));
  } else return false;
  return true;
}

function requestedChapters(options:{chapterCount?:number;minutes?:number}|null){
  if(options?.chapterCount!==undefined)return options.chapterCount;
  return new Map([[10,1],[20,2],[30,5]]).get(options?.minutes??0)??0;
}
