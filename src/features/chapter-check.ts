import type { Context } from '../server.ts';
import { chapterCheck,updateCheck } from '../chapter-check.ts';

export default async function check({url,req,body,store,json}:Context) {
  const route=url.pathname.match(/^\/api\/stories\/([^/]+)\/check\/(\d+)$/);
  if(!route)return false;
  const id=decodeURIComponent(route[1]),chapter=Number(route[2]);
  if(req.method==='GET')json(200,await chapterCheck(store,id,chapter));
  else if(req.method==='POST')json(200,await updateCheck(store,id,chapter,await body()));
  else return false;
  return true;
}
