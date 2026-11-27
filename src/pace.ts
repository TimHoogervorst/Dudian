import type { ReadingStore } from './store.ts';
import { activeMillis } from './activity.ts';

export async function targetWordCount(store:ReadingStore,minutes:number) {
  const {db}=store;

  const samples:number[]=[];
  const completed=await db.prepare(`SELECT c.story_id,c.chapter,c.at,c.word_count FROM chapter_completions c
    WHERE c.word_count>0 AND EXISTS (SELECT 1 FROM reading_intervals r WHERE r.story_id=c.story_id AND r.chapter=c.chapter AND r.start<c.at)
    ORDER BY c.at DESC LIMIT 30`).all();
  const intervals=db.prepare('SELECT start,"end" FROM reading_intervals WHERE story_id=$1 AND chapter=$2 AND start<$3');
  for (const chapter of completed){
    const spans=(await intervals.all(chapter.story_id,chapter.chapter,chapter.at))
      .map(row=>({start:Number(row.start),end:Math.min(Number(row.end),Number(chapter.at))}));
    const time=activeMillis(spans);
    if(time<15000)continue;
    samples.push(Number(chapter.word_count)*60000/time);
    if(samples.length===7)break;
  }
  if(samples.length<3)return minutes*16;
  samples.sort((a,b)=>a-b);
  const middle=(samples.length-1)/2;
  const median=(samples[Math.floor(middle)]+samples[Math.ceil(middle)])/2;
  // Clamp unusual measurements such as skipping through a chapter or leaving a tab open.
  return Math.round(minutes*Math.max(4,Math.min(48,median)));
}
