import type {Context} from '../server.ts';
import {rateStory,storySummary} from '../story-summary.ts';

export default async function summary({req,url,json,body,store}:Context) {
  const match=url.pathname.match(/^\/api\/stories\/([^/]+)\/(summary|rating)$/);
  if(!match)return false;
  const id=decodeURIComponent(match[1]);
  if(req.method==='GET'&&match[2]==='summary') {
    json(200,storySummary(store,id));
  } else if(req.method==='POST'&&match[2]==='rating') {
    const data=await body();
    json(200,rateStory(store,id,data?.rating));
  } else return false;
  return true;
}
