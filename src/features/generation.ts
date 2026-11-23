import type { Context } from '../server.ts';
import { buildPlan, getPreferences, setPreferences } from '../story-plan.ts';
import { generateStory } from '../story-generation.ts';

export default async function generation({url,req,body,json,store}:Context) {
  if (url.pathname === '/api/story-preferences' && req.method==='GET') {
    json(200,getPreferences(store));
  } else if (url.pathname === '/api/story-preferences' && req.method==='POST') {
    json(200,setPreferences(store,await body()));
  } else if (url.pathname === '/api/generate-story' && req.method==='POST') {
    const options = await body();
    const plan = buildPlan(store,options?.difficulty,options?.minutes);
    const story = await generateStory(store,plan);
    json(201,{id:story.id,title:story.title,preview:story.preview});
  } else return false;
  return true;
}
