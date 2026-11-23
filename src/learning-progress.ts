import {HttpError,type ReadingStore} from './store.ts';
import {statusScores} from './strength.ts';
import type {ItemKind} from './catalog.ts';

export function learningProgress(store:ReadingStore,period:string,zone:string,now=Date.now()){
  if(!['week','month','year'].includes(period))throw new HttpError(400,'Choose a week, month, or year.');
  let format:Intl.DateTimeFormat;
  try{format=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});}
  catch{throw new HttpError(400,'Unknown time zone.');}
  const today=format.format(now);
  const started=Number(store.db.prepare('SELECT started_at FROM score_tracking WHERE id=1').get()!.started_at);
  const trackedSince=format.format(started);
  // Calendar arithmetic on local date labels, independent of daylight-saving transitions.
  const first=new Date(today+'T00:00:00Z');
  if(period==='week')first.setUTCDate(first.getUTCDate()-(first.getUTCDay()+6)%7);
  else first.setUTCDate(1);
  if(period==='year')first.setUTCMonth(0);
  const year=first.getUTCFullYear(),month=first.getUTCMonth();
  const count=period==='week'?7:period==='year'?12:new Date(Date.UTC(year,month+1,0)).getUTCDate();
  const key=(day:string)=>period==='year'?day.slice(0,7):day;
  const buckets=Array.from({length:count},(_,i)=>{
    const day=new Date(period==='year'?Date.UTC(year,i,1):Date.UTC(year,month,first.getUTCDate()+i)).toISOString().slice(0,10);
    const date=key(day);
    return {date,points:date>=key(trackedSince)&&date<=key(today)?0:null as number|null};
  });
  const byDate=new Map(buckets.map(b=>[b.date,b]));
  const mastered=new Map<string,{kind:ItemKind;text:string}>();
  let gained=0,lost=0;
  const rows=store.db.prepare('SELECT * FROM score_changes WHERE at BETWEEN ? AND ? ORDER BY at,rowid')
    .iterate(Math.max(started,first.getTime()-86400000),now);
  for(const row of rows){
    const bucket=byDate.get(key(format.format(Number(row.at))));
    if(!bucket || bucket.points===null)continue;
    const before=Number(row.before_score),after=Number(row.after_score),text=String(row.text);
    if(after<statusScores.green)mastered.delete(text);
    if(row.manual)continue;
    if(before<statusScores.green && after>=statusScores.green)mastered.set(text,{kind:row.kind as ItemKind,text});
    const delta=after-before;
    gained+=Math.max(0,delta);lost+=Math.max(0,-delta);bucket.points+=delta;
  }
  return {gained,lost,net:gained-lost,strong:mastered.size,examples:[...mastered.values()].reverse().slice(0,5),buckets,
    trackedSince:trackedSince>=first.toISOString().slice(0,10)?trackedSince:null};
}
