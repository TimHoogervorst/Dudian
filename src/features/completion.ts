import type {Context} from '../server.ts';
import {completionFor,finishChapter} from '../completion.ts';

export default async function completion({url,req,body,store,json}:Context) {
  const route=url.pathname.match(/^\/api\/stories\/([^/]+)\/(complete|completion)$/);
  if(!route)return false;
  const storyId=decodeURIComponent(route[1]);
  if(route[2]==='complete' && req.method==='POST') {
    json(200,finishChapter(store,storyId,(await body())?.chapter));
  } else if(route[2]==='completion' && req.method==='GET'){
    store.story(storyId);
    json(200,completionFor(store,storyId));
  }else return false;
  return true;
}
