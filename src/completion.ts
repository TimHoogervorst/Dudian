import { ReadingStore,HttpError } from './store.ts';
import { readingItems,seeItem } from './encounters.ts';
import { awardStory,recordStoryPoints,storyFocus,questionCharacters } from './story-scoring.ts';
import { storyDifficulty } from './story-difficulty.ts';

export async function completionFor(store:ReadingStore,storyId:string) {

  const chapters=await store.db.prepare('SELECT chapter FROM chapter_completions WHERE story_id=$1 ORDER BY chapter').all(storyId);
  return {chapters:chapters.map(row=>Number(row.chapter)),finished:!!await store.db.prepare('SELECT 1 FROM story_completions WHERE story_id=$1').get(storyId)};
}
export async function finishChapter(store:ReadingStore,storyId:string,chapter:number,now=Date.now()) {
  const story=await store.story(storyId);
  if(!Number.isInteger(chapter)||!story.chapters[chapter])throw new HttpError(400,'Choose a chapter in this story.');
  const words=story.chapters[chapter].paragraphs.flat().filter(t=>!t.cast).map(t=>t.text).filter(t=>/\p{Script=Han}/u.test(t));
  const db=store.db;

  const questions=story.chapters[chapter].questions??[];
  const testedWords=new Set(questions.map(q=>q.word));
  const testedCharacters=new Set(questions.flatMap(q=>q.characters));
  await db.transaction(async () => {
    const answered=await db.prepare('SELECT count(choice) AS total FROM quiz_attempts WHERE story_id=$1 AND chapter=$2').get(storyId,chapter);
    if(Number(answered?.total)<questions.length)throw new HttpError(409,'Answer the chapter questions first.');
    const first=await db.prepare('INSERT INTO chapter_completions(story_id,chapter,at,word_count) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING').run(storyId,chapter,now,words.length);
    if(first.changes) {
      const tier=storyFocus(story,chapter);
      const full=storyDifficulty[story.difficulty??'easy'].points;
      const aided=await db.prepare('SELECT DISTINCT word FROM word_actions WHERE story_id=$1 AND chapter=$2').all(storyId,chapter);
      const blocked=readingItems(aided.map(row=>String(row.word)));
      for(const text of [...testedWords,...testedCharacters])blocked.add(text);
      const appearances=readingItems(words);
      const correctChars=new Set<string>();
      for(const row of await db.prepare('SELECT question,choice,english FROM quiz_attempts WHERE story_id=$1 AND chapter=$2').all(storyId,chapter)){
        const q=questions[Number(row.question)];
        if(!q.reviewRound && row.choice===q.correct && !row.english){
          for(const char of questionCharacters(q)){correctChars.add(char);appearances.add(char);}
        }
      }
      for(const text of appearances){
        if(!blocked.has(text)){
          const focus=tier(text);
          const gain=focus==='strong'?full:focus==='other'?0.25:focus==='soft' && correctChars.has(text)?0.5:0;
          if(gain)await recordStoryPoints(db,storyId,chapter,text,gain,now,'appearance');
        }
        await seeItem(db,text,now);
      }
      const completed=await db.prepare('SELECT COUNT(*) AS total FROM chapter_completions WHERE story_id=$1').get(storyId);
      if(Number(completed?.total)===story.chapters.length){
        const finished=await db.prepare('INSERT INTO story_completions(story_id,at) VALUES($1,$2) ON CONFLICT DO NOTHING').run(storyId,now);
        if(finished.changes)await awardStory(db,story,now);
      }
    }

  });
  return await completionFor(store,storyId);
}
