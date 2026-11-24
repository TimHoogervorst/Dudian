import type {DatabaseSync} from 'node:sqlite';
import {ReadingStore,HttpError} from './store.ts';
import {readingItems,seeItem} from './encounters.ts';
import {awardStory,recordStoryPoints,storyFocus,questionCharacters} from './story-scoring.ts';
import {ensureActions} from './word-actions.ts';
import {storyDifficulty} from './story-difficulty.ts';

export function ensureCompletions(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS quiz_attempts(
    story_id TEXT NOT NULL REFERENCES stories(id), chapter INTEGER NOT NULL, question INTEGER NOT NULL,
    english INTEGER NOT NULL DEFAULT 0, choice INTEGER, PRIMARY KEY(story_id,chapter,question));
    CREATE TABLE IF NOT EXISTS chapter_completions(
    story_id TEXT NOT NULL REFERENCES stories(id),chapter INTEGER NOT NULL,at INTEGER NOT NULL,
    word_count INTEGER NOT NULL,PRIMARY KEY(story_id,chapter));`);
}
export function completionFor(store:ReadingStore,storyId:string) {
  ensureCompletions(store.db);
  const chapters=store.db.prepare('SELECT chapter FROM chapter_completions WHERE story_id=? ORDER BY chapter').all(storyId);
  return {chapters:chapters.map(row=>Number(row.chapter)),finished:!!store.db.prepare('SELECT 1 FROM story_completions WHERE story_id=?').get(storyId)};
}
export function finishChapter(store:ReadingStore,storyId:string,chapter:number,now=Date.now()) {
  const story=store.story(storyId);
  if(!Number.isInteger(chapter)||!story.chapters[chapter])throw new HttpError(400,'Choose a chapter in this story.');
  const words=story.chapters[chapter].paragraphs.flat().filter(t=>!t.cast).map(t=>t.text).filter(t=>/\p{Script=Han}/u.test(t));
  const db=store.db;
  ensureActions(db);
  ensureCompletions(db);
  const questions=story.chapters[chapter].questions??[];
  const testedWords=new Set(questions.map(q=>q.word));
  const testedCharacters=new Set(questions.flatMap(q=>q.characters));
  const ownsTransaction=!db.isTransaction;
  if(ownsTransaction)db.exec('BEGIN IMMEDIATE');
  try {
    const answered=db.prepare('SELECT count(choice) AS total FROM quiz_attempts WHERE story_id=? AND chapter=?').get(storyId,chapter);
    if(Number(answered?.total)<questions.length)throw new HttpError(409,'Answer the chapter questions first.');
    const first=db.prepare('INSERT OR IGNORE INTO chapter_completions VALUES(?,?,?,?)').run(storyId,chapter,now,words.length);
    if(first.changes) {
      const tier=storyFocus(story,chapter);
      const full=storyDifficulty[story.difficulty??'easy'].points;
      const aided=db.prepare('SELECT DISTINCT word FROM word_actions WHERE story_id=? AND chapter=?').all(storyId,chapter);
      const blocked=readingItems(aided.map(row=>String(row.word)));
      for(const text of [...testedWords,...testedCharacters])blocked.add(text);
      const appearances=readingItems(words);
      const correctChars=new Set<string>();
      for(const row of db.prepare('SELECT question,choice,english FROM quiz_attempts WHERE story_id=? AND chapter=?').all(storyId,chapter)){
        const q=questions[Number(row.question)];
        if(!q.reviewRound && row.choice===q.correct && !row.english){
          for(const char of questionCharacters(q)){correctChars.add(char);appearances.add(char);}
        }
      }
      for(const text of appearances){
        if(!blocked.has(text)){
          const focus=tier(text);
          const gain=focus==='strong'?full:focus==='other'?0.25:focus==='soft' && correctChars.has(text)?0.5:0;
          if(gain)recordStoryPoints(db,storyId,chapter,text,gain,now,'appearance');
        }
        seeItem(db,text,now);
      }
      const completed=db.prepare('SELECT COUNT(*) AS total FROM chapter_completions WHERE story_id=?').get(storyId);
      if(Number(completed?.total)===story.chapters.length){
        const finished=db.prepare('INSERT OR IGNORE INTO story_completions VALUES(?,?)').run(storyId,now);
        if(finished.changes)awardStory(db,story,now);
      }
    }
    if(ownsTransaction)db.exec('COMMIT');
  }catch(error){if(ownsTransaction)db.exec('ROLLBACK');throw error;}
  return completionFor(store,storyId);
}
