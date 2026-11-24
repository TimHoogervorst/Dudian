import { generateStory, type CandidateWriter, type GenerationStage } from './story-generation.ts';
import { difficulties, validLength, type StoryPlan, type StoryLength, type Difficulty } from './story-plan.ts';
import {practicePreview,confirmedPlan} from './practice-preview.ts';
import { HttpError, type ReadingStore } from './store.ts';
import {artSettings,ensureArt,queueArtwork} from './cover-art.ts';

export function initializeGeneration(store:ReadingStore) {
  ensureArt(store);
  store.db.exec("UPDATE story_art SET status='failed',error='Drawing was interrupted. Retry the illustration.' WHERE status='drawing'");
  store.db.exec(`CREATE TABLE IF NOT EXISTS generation_job (
    id INTEGER PRIMARY KEY CHECK(id=1), difficulty TEXT, minutes INTEGER, stage TEXT,
    storyId TEXT REFERENCES stories(id), error TEXT
  );`);
  if(!store.db.prepare('PRAGMA table_info(generation_job)').all().some(c=>c.name==='failedStage')){
    store.db.exec('ALTER TABLE generation_job ADD COLUMN failedStage TEXT');
  }
  if(!store.db.prepare('PRAGMA table_info(generation_job)').all().some(c=>c.name==='detail')){
    store.db.exec('ALTER TABLE generation_job ADD COLUMN detail TEXT');
  }
  store.db.exec(`UPDATE generation_job SET failedStage=stage, stage='failed', error='Story generation was interrupted when the app restarted.'
    WHERE stage NOT IN ('ready','failed');`);
}

export function latestGeneration(store:ReadingStore) {
  return store.db.prepare(`SELECT j.difficulty,j.minutes,j.stage,j.detail,j.failedStage,j.storyId,j.error,s.title,
    json_type(s.content,'$.cover') IS NOT NULL AS hasCover,a.status AS artStatus
    FROM generation_job j LEFT JOIN stories s ON s.id=j.storyId LEFT JOIN story_art a ON a.id=s.id
    WHERE j.id=1 AND NOT EXISTS(SELECT 1 FROM hidden_stories h WHERE h.story_id=j.storyId)`).get() ?? null;
}

export function startGeneration(store:ReadingStore,difficulty:Difficulty,minutes:StoryLength,write?:CandidateWriter,confirmed?:StoryPlan) {
  if (!difficulties.includes(difficulty) || !validLength(minutes)) throw new HttpError(400,'Choose a story length and difficulty.');
  const existing=latestGeneration(store);
  if(existing && existing.stage!=='ready' && existing.stage!=='failed')return existing;
  store.db.prepare("INSERT OR REPLACE INTO generation_job(id,difficulty,minutes,stage) VALUES(1,?,?,'planning')").run(difficulty,minutes);
  const report=(stage:GenerationStage,detail?:string)=>store.db.prepare('UPDATE generation_job SET stage=?,detail=? WHERE id=1').run(stage,detail??null);
  setImmediate(async()=>{
    try {
      const plan=confirmed??confirmedPlan(store,practicePreview(store,{difficulty,minutes}).id,difficulty,minutes);
      const story=await generateStory(store,plan,write,report);
      store.db.prepare("UPDATE generation_job SET stage='ready',storyId=? WHERE id=1").run(story.id);
      if(artSettings(store).enabled)queueArtwork(store,story.id);
    } catch(error) {
      store.db.prepare("UPDATE generation_job SET failedStage=stage,stage='failed',error=? WHERE id=1")
        .run(error instanceof Error ? error.message : 'Unable to generate this story.');
    }
  });
  return latestGeneration(store);
}
