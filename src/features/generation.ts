import {practicePreview,confirmedPlan} from '../practice-preview.ts';
import type { Context } from '../server.ts';
import { getPreferences, setPreferences } from '../story-plan.ts';
import { latestGeneration, startGeneration } from '../generation-job.ts';

export default async function generation({url,req,body,json,store}:Context) {
  if (url.pathname === '/api/story-preferences' && req.method==='GET') {
    json(200,getPreferences(store));
  } else if (url.pathname === '/api/story-preferences' && req.method==='POST') {
    json(200,setPreferences(store,await body()));
  } else if(url.pathname==='/api/practice-preview' && req.method==='POST'){
    json(200,practicePreview(store,(await body())??{}));
  } else if (url.pathname === '/api/generate-story' && req.method==='POST') {
    const options = await body();
    const plan=options?.previewId===undefined?undefined:confirmedPlan(store,options.previewId,options.difficulty,options.minutes,options.subject);
    json(202,startGeneration(store,options?.difficulty,options?.minutes,undefined,plan));
  } else if(url.pathname==='/api/generation-job' && req.method==='GET') {
    json(200,latestGeneration(store));
  } else return false;
  return true;
}
