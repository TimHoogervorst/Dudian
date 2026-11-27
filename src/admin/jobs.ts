import type { Pool } from 'pg';
import {storySubjects} from '../practice-subjects.ts';
import { catalog } from '../catalog.ts';
import { generateReading,type CandidateWriter } from '../story-generation.ts';
import { generateText } from '../provider.ts';
import { HttpError,type ReadingStore } from '../store.ts';
import { transaction } from '../postgres/database.ts';
import { difficulties,readingSize,validLength,type StoryPlan } from '../story-plan.ts';
import { focusBudget,lengthBudget } from '../story-difficulty.ts';
import { articleDocuments,readingOptions } from '../reading-types.ts';
import { queueArtwork } from '../cover-art.ts';

export const catalogBackground=['我','是','你','好','吗'];

export function catalogPlan(input:any):StoryPlan {
  const {character,band,difficulty,chapterCount,type}=input??{};
  const targets=input?.characters??[character];
  if(!Number.isInteger(band)||band<1||band>6 || !difficulties.includes(difficulty) ||
      !validLength(chapterCount)||!['book','article','dialogue'].includes(type))
    throw new HttpError(400,'Choose a curriculum character, compatible HSK band, difficulty, reading type and 1–6 chapters.');
  if(!Array.isArray(targets)||!targets.length||targets.length>focusBudget(difficulty as StoryPlan['difficulty'],chapterCount)||
    new Set(targets).size!==targets.length||targets.some(c=>typeof c!=='string'||(catalog.characterLevel(c)??Infinity)>band))
    throw new HttpError(400,'Choose distinct curriculum characters within the audience and focus budget.');
  const subject=input.subject?storySubjects.find(topic=>topic.zh===input.subject && topic.level<=band):undefined;
  if(input.subject && !subject)throw new HttpError(400,'Choose a subject available at this HSK level.');
  const available=catalog.list('character').filter(c=>c.level<band).map(c=>c.text).join('')+catalogBackground.join('');
  const format=type==='article'?{type:'article' as const,documents:articleDocuments(band-1,chapterCount)}:
    type==='dialogue'?{type:'dialogue' as const,people:2}:{type:'book' as const,stage:readingOptions(band-1).stage};
  return {...readingSize(difficulty,chapterCount),catalogTargets:targets,hskLimit:band,format,subject,
    ceiling:lengthBudget(({easy:2,medium:3,hard:5})[difficulty as 'easy'|'medium'|'hard'],chapterCount),
    background:[...catalogBackground],newCharacters:targets,newWords:targets,reviewWords:[],
    characters:{available,passed:band-1,beginner:false,familiar:''}};
}

export async function enqueue(pool:Pool,input:any){
  const plan=catalogPlan(input);
  if(typeof input.id!=='string'||!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.id))
    throw new HttpError(400,'A generation request ID is required.');
  const {character,band,difficulty,type,chapterCount}=input;
  const request=JSON.stringify({...(input.characters?{characters:plan.catalogTargets}:{character}),band,difficulty,type,chapterCount,...(input.subject?{subject:input.subject}:{})});
  const result=await pool.query(`INSERT INTO catalog_jobs(id,request) VALUES($1,$2)
    ON CONFLICT(id) DO UPDATE SET request=catalog_jobs.request WHERE catalog_jobs.request=excluded.request RETURNING id`,[input.id,request]);
  if(!result.rowCount)throw new HttpError(409,'This request ID belongs to another story.');
  return {id:input.id};
}

export function catalogWorker(pool:Pool,store:ReadingStore,write:CandidateWriter=generateText){
  let closed=false;
  let pending:Promise<void>|undefined;
  async function drain(){
    const client=await pool.connect();
    let locked=false;
    try {
      locked=(await client.query('SELECT pg_try_advisory_lock(128014,4) AS locked')).rows[0].locked;
      if(!locked)return;
      await client.query("UPDATE catalog_jobs SET stage='failed',error='Generation was interrupted. Generate again to retry.' WHERE stage NOT IN ('queued','published','failed')");
      while(!closed){
        const job=(await client.query(`UPDATE catalog_jobs SET stage='writing' WHERE id=(
          SELECT id FROM catalog_jobs WHERE stage='queued' ORDER BY created_at,id LIMIT 1) RETURNING id,request`)).rows[0];
        if(!job)break;
        let progress=Promise.resolve();
        try{
          const story=await generateReading(catalogPlan(job.request),write,[],stage=>{
            progress=progress.then(async()=>{await client.query('UPDATE catalog_jobs SET stage=$1 WHERE id=$2',[stage,job.id]);});
            void progress.catch(()=>{});
          });
          await progress;
          await transaction(pool,async db=>{
            await db.query('INSERT INTO stories VALUES($1,$2,$3,$4)',[story.id,story.title,JSON.stringify(story),Date.now()]);
            await db.query("UPDATE catalog_jobs SET stage='published',story_id=$1 WHERE id=$2",[story.id,job.id]);
          });
          if((await client.query('SELECT enabled FROM art_settings WHERE id=1')).rows[0]?.enabled)
            await queueArtwork(store,story.id);
        }catch(error){
          await progress.catch(()=>{});
          await client.query("UPDATE catalog_jobs SET stage='failed',error=$1 WHERE id=$2 AND stage<>'published'",[(error as Error).message,job.id]);
        }
      }
    }finally{
      try{if(locked)await client.query('SELECT pg_advisory_unlock(128014,4)');}finally{client.release();}
    }
  }
  const tick=()=>{if(!pending && !closed)pending=drain().catch(console.error).finally(()=>{pending=undefined;});};
  const timer=setInterval(tick,1000);timer.unref();tick();
  return async()=>{closed=true;clearInterval(timer);await pending;};
}
