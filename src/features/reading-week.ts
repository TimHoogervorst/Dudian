import type {Context} from '../server.ts';
import {recordInterval,readingWeek} from '../activity.ts';

export default async function weeklyActivity({req,url,store,json,body}:Context) {
  if(req.method==='GET'&&url.pathname==='/api/reading-week'){
    json(200,readingWeek(store,Date.now(),url.searchParams.get('zone')??'UTC'));
  }else if(req.method==='POST'&&url.pathname==='/api/reading-interval'){
    const value=await body();recordInterval(store,value?.storyId,value?.chapter,value?.duration);
    json(200,{ok:true});
  }else return false;
  return true;
}

