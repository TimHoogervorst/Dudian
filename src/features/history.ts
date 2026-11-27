import { learningProgress } from '../learning-progress.ts';
import { history,openStory } from '../history.ts';
import type { Context } from '../server.ts';
import { milestoneProgress } from '../milestone-progress.ts';

export default async function historyRoutes({req,url,store,json}:Context) {
  if(req.method==='GET'&&url.pathname==='/api/learning-progress'){
    json(200,await learningProgress(store,url.searchParams.get('period')??'week',url.searchParams.get('zone')??'UTC'));
    return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/reading-progress'){
    json(200,await milestoneProgress(store.db));
    return true;
  }
  if(req.method==='GET'&&url.pathname==='/api/history') {
    json(200,await history(store));
    return true;
  }
  const match=url.pathname.match(/^\/api\/stories\/([^/]+)\/(opened|hide)$/);
  if(req.method==='POST'&&match) {
    const id=decodeURIComponent(match[1]);
    if(match[2]==='hide'){
      await store.story(id);
      await store.db.prepare('INSERT INTO hidden_stories(story_id) VALUES($1) ON CONFLICT DO NOTHING').run(id);
    }else await openStory(store,id);
    json(200,{ok:true});
    return true;
  }
  return false;
}
