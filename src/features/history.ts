import {history,openStory} from '../history.ts';
import type {Context} from '../server.ts';

export default function historyRoutes({req,url,store,json}:Context) {
  if(req.method==='GET'&&url.pathname==='/api/history') {
    json(200,history(store));
    return true;
  }
  const match=url.pathname.match(/^\/api\/stories\/([^/]+)\/opened$/);
  if(req.method==='POST'&&match) {
    openStory(store,decodeURIComponent(match[1]));
    json(200,{ok:true});
    return true;
  }
  return false;
}
