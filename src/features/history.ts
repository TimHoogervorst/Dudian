import {learningProgress} from '../learning-progress.ts';
import {history,openStory} from '../history.ts';
import type {Context} from '../server.ts';
import {hskReadingProgress} from '../strength.ts';

export default function historyRoutes({req,url,store,json}:Context) {
  if(req.method==='GET'&&url.pathname==='/api/learning-progress'){
    json(200,learningProgress(store,url.searchParams.get('period')??'week',url.searchParams.get('zone')??'UTC'));
    return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/reading-progress'){
    json(200,{level:hskReadingProgress(store.db)});
    return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/history') {
    json(200,history(store));
    return true;
  }
  const match=url.pathname.match(/^\/api\/stories\/([^/]+)\/(opened|hide)$/);
  if(req.method==='POST'&&match) {
    const id=decodeURIComponent(match[1]);
    if(match[2]==='hide'){
      store.story(id);
      store.db.prepare('INSERT OR IGNORE INTO hidden_stories VALUES(?)').run(id);
    }else openStory(store,id);
    json(200,{ok:true});
    return true;
  }
  return false;
}
