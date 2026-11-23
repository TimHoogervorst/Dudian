import type {DatabaseSync} from 'node:sqlite';
import {ReadingStore,HttpError} from './store.ts';
import {ensureActions} from './word-actions.ts';
import {ensureCompletions} from './completion.ts';

export function ensureActivity(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS reading_advances(story_id TEXT NOT NULL REFERENCES stories(id),chapter INTEGER NOT NULL,at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS advances_time ON reading_advances(at);
    CREATE TABLE IF NOT EXISTS reading_intervals(story_id TEXT NOT NULL REFERENCES stories(id),chapter INTEGER NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,PRIMARY KEY(story_id,chapter,start,end));
    CREATE INDEX IF NOT EXISTS intervals_time ON reading_intervals(end);`);
}
export function markAdvance(store:ReadingStore,storyId:string,chapter:number,now=Date.now()){
  ensureActivity(store.db);
  store.db.prepare('INSERT INTO reading_advances VALUES(?,?,?)').run(storyId,chapter,now);
}
export function recordInterval(store:ReadingStore,storyId:string,chapter:number,duration:number,now=Date.now()) {
  if (!Number.isSafeInteger(duration)||duration<1||duration>30000)throw new HttpError(400,'Choose an active reading interval of up to 30 seconds.');
  if(!Number.isInteger(chapter)||!store.story(storyId).chapters[chapter])throw new HttpError(400,'Choose a chapter.');
  ensureActivity(store.db);
  store.db.prepare('INSERT OR IGNORE INTO reading_intervals VALUES(?,?,?,?)').run(storyId,chapter,now-duration,now);
}
export interface Interval {start:number;end:number}
export function activeMillis(intervals:Interval[]) {
  let total=0,previous=-Infinity;
  for(const {start,end} of [...intervals].sort((a,b)=>a.start-b.start)){
    total+=Math.max(0,end-Math.max(start,previous));
    previous=Math.max(previous,end);
  }
  return total;
}
export function readingWeek(store:ReadingStore,now=Date.now(),zone='UTC'){
  ensureActions(store.db);ensureCompletions(store.db);ensureActivity(store.db);
  let format:Intl.DateTimeFormat;
  try{format=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});}
  catch{throw new HttpError(400,'Unknown time zone.');}
  const today=format.format(now);
  const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7;
  const dayMs=86400000;
  const monday=Date.parse(today+'T00:00:00Z')-(weekday-1)*dayMs;
  const days=Array.from({length:7},(_,i)=>({date:new Date(monday+i*dayMs).toISOString().slice(0,10),state:'empty'}));
  const dayMap=new Map(days.map(day=>[day.date,day]));
  const min=monday-dayMs,max=monday+8*dayMs;
  const activity=store.db.prepare(`SELECT at FROM word_actions WHERE at BETWEEN ? AND ? UNION ALL
    SELECT at FROM reading_advances WHERE at BETWEEN ? AND ?`).all(min,max,min,max);
  for(const row of activity){const day=dayMap.get(format.format(Number(row.at)));if(day)day.state='light';}
  const buckets=new Map<string,Interval[]>();
  function add(key:string,start:number,end:number){
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key)!.push({start,end});
  }
  for(const row of store.db.prepare('SELECT start,end FROM reading_intervals WHERE end BETWEEN ? AND ?').all(min,max)){
    const start=Number(row.start),end=Number(row.end);
    const key=format.format(start),last=format.format(end-1);
    if(key===last){add(key,start,end);continue;}
    // Split the small set of intervals crossing local midnight, including DST days.
    let lo=start,hi=end;
    while(lo+1<hi){const mid=Math.floor((lo+hi)/2);if(format.format(mid)===key)lo=mid;else hi=mid;}
    add(key,start,hi);add(last,hi,end);
  }
  for(const [key,intervals] of buckets){const day=dayMap.get(key);if(day && activeMillis(intervals)>=60000)day.state='light';}
  let finished=0;
  for(const row of store.db.prepare('SELECT at FROM story_completions WHERE at BETWEEN ? AND ?').all(min,max)){
    const day=dayMap.get(format.format(Number(row.at)));if(day){day.state='full';finished++;}
  }
  return {days,finished,today};
}

