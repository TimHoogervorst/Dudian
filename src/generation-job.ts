import type { Pool } from 'pg';
import { generateReading,type CandidateWriter } from './story-generation.ts';
import { difficulties,validLength,type Difficulty,type StoryPlan } from './story-plan.ts';
import { practicePreview,confirmedPlan } from './practice-preview.ts';
import { HttpError,ReadingStore } from './store.ts';
import { LearnerDatabase } from './postgres/learner-database.ts';
import { generateText } from './provider.ts';
import { planWordReviews } from './word-review.ts';
import { artSettings,queueArtwork } from './cover-art.ts';

export async function latestGeneration(store: ReadingStore) {
  return await store.db.prepare(`SELECT j.id,j.difficulty,j.minutes,j."chapterCount",j.stage,j.detail,j."failedStage",j."storyId",j.error,s.title,
    (s.content->'cover') IS NOT NULL AS "hasCover",a.status AS "artStatus"
    FROM generation_job j LEFT JOIN stories s ON s.id=j."storyId" LEFT JOIN story_art a ON a.id=s.id
    WHERE NOT EXISTS (SELECT 1 FROM hidden_stories h WHERE h.story_id=j."storyId")
    ORDER BY j.id DESC LIMIT 1`).get() ?? null;
}

export async function startGeneration(store: ReadingStore, difficulty: Difficulty, chapterCount: number, confirmed?: StoryPlan) {
  if (!difficulties.includes(difficulty) || !validLength(chapterCount)) throw new HttpError(400,'Choose a story length and difficulty.');
  const plan = confirmed ?? confirmedPlan(store,(await practicePreview(store,{difficulty,chapterCount})).id,difficulty,chapterCount);
  const rounds = await planWordReviews(store,plan);
  return store.db.prepare(`INSERT INTO generation_job(difficulty,"chapterCount",stage,plan) VALUES($1,$2,'queued',$3)
    RETURNING id,difficulty,"chapterCount",stage`).get(difficulty,chapterCount,JSON.stringify({plan,rounds}));
}

export function generationWorker(pool: Pool, write: CandidateWriter = generateText) {
  let running = false;
  let closed = false;
  async function drain() {
    if (running || closed) return;
    running = true;
    try {
      const client = await pool.connect();
      let locked = false;
      try {
        locked = (await client.query('SELECT pg_try_advisory_lock(128014,3) AS locked')).rows[0].locked;
        if (!locked) return;
        await client.query(`UPDATE generation_job SET "failedStage"=stage, stage='failed', error='Generation was interrupted. Please retry.'
          WHERE stage NOT IN ('queued','ready','failed')`);
        while (!closed) {
          const job = (await client.query(`UPDATE generation_job SET stage='planning'
            WHERE (account_id,id)=(SELECT account_id,id FROM generation_job WHERE stage='queued' ORDER BY queued_at,id LIMIT 1)
            RETURNING id,account_id,plan`)).rows[0];
          if (!job) break;
          const store = new ReadingStore(new LearnerDatabase(pool,job.account_id));
          // Preserve stage order even when the generator reports two stages before its next await.
          let progress = Promise.resolve();
          const report = (stage: string,detail?: string) => {
            progress = progress.then(async () => {
              await client.query('UPDATE generation_job SET stage=$1,detail=$2 WHERE account_id=$3 AND id=$4',[stage,detail??null,job.account_id,job.id]);
            });
            void progress.catch(()=>{});
          };
          try {
            const story = await generateReading(job.plan.plan,write,job.plan.rounds,report);
            await progress;
            await store.db.transaction(async () => {
              await store.saveStory(story);
              await store.db.prepare(`UPDATE generation_job SET stage='ready',"storyId"=$1,detail=NULL WHERE id=$2`).run(story.id,job.id);
            });
            if ((await artSettings(store)).enabled) await queueArtwork(store,story.id);
          } catch (error) {
            await progress.catch(()=>{});
            await client.query(`UPDATE generation_job SET "failedStage"=stage,stage='failed',error=$1
              WHERE account_id=$2 AND id=$3 AND stage<>'ready'`,[error instanceof Error?error.message:'Generation failed.',job.account_id,job.id]);
          }
        }
      } finally {
        try { if (locked) await client.query('SELECT pg_advisory_unlock(128014,3)'); }
        finally { client.release(); }
      }
    } finally { running = false; }
  }
  let pending: Promise<void> | undefined;
  const tick = () => {
    if (!running) pending=drain().catch(error=>console.error('Generation queue:',error.message));
  };
  const timer = setInterval(tick,1000);
  timer.unref();
  tick();
  return async () => { closed = true; clearInterval(timer); await pending; };
}
