import { ReadingStore,HttpError } from './store.ts';

export async function markAdvance(store:ReadingStore,storyId:string,chapter:number,now=Date.now()){

  await store.db.prepare('INSERT INTO reading_advances(story_id,chapter,at) VALUES($1,$2,$3)').run(storyId,chapter,now);
}
export async function recordInterval(store:ReadingStore,storyId:string,chapter:number,duration:number,now=Date.now()) {
  if (!Number.isSafeInteger(duration)||duration<1||duration>30000)throw new HttpError(400,'Choose an active reading interval of up to 30 seconds.');
  if(!Number.isInteger(chapter)||!(await store.story(storyId)).chapters[chapter])throw new HttpError(400,'Choose a chapter.');

  await store.db.prepare('INSERT INTO reading_intervals(story_id,chapter,start,"end") VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING').run(storyId,chapter,now-duration,now);
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
export async function readingWeek(store:ReadingStore,now=Date.now(),zone='UTC'){

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
  const activity=await store.db.prepare(`SELECT at FROM word_actions WHERE at BETWEEN $1 AND $2 UNION ALL
    SELECT at FROM reading_advances WHERE at BETWEEN $3 AND $4`).all(min,max,min,max);
  for(const row of activity){const day=dayMap.get(format.format(Number(row.at)));if(day)day.state='light';}
  const buckets=new Map<string,Interval[]>();
  function add(key:string,start:number,end:number){
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key)!.push({start,end});
  }
  for(const row of await store.db.prepare('SELECT start,"end" FROM reading_intervals WHERE "end" BETWEEN $1 AND $2').all(min,max)){
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
  for(const row of await store.db.prepare('SELECT at FROM story_completions WHERE at BETWEEN $1 AND $2').all(min,max)){
    const day=dayMap.get(format.format(Number(row.at)));if(day){day.state='full';finished++;}
  }
  return {days,finished,today};
}
