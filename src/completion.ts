import type {DatabaseSync} from 'node:sqlite';
import {ReadingStore,HttpError} from './store.ts';
import {adjustStoryStrength,strengthFor} from './strength.ts';
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
      const preview=story.preview;
      const targets=new Set([...(preview?.words??[]),...(preview?.review??[])].map(item=>item.text));
      if(preview?.compound)targets.add(preview.compound.text);
      for(const item of preview?.characters??[])targets.add(item.text);
      for(const char of preview?.reviewCharacters??[])targets.add(char);
      const focusPoints=storyDifficulty[story.difficulty??'easy'].points;
      const aided=new Set(db.prepare('SELECT DISTINCT word FROM word_actions WHERE story_id=? AND chapter=?').all(storyId,chapter).map(row=>row.word));
      const blocked=new Set([...testedCharacters,...aided].join(''));
      for(const row of db.prepare('SELECT question,choice,english FROM quiz_attempts WHERE story_id=? AND chapter=?').all(storyId,chapter)){
        const q=questions[Number(row.question)];
        if(!q.reviewRound && (Array.from(q.word).length===1 || row.choice!==q.correct || row.english))
          for(const char of q.word)blocked.add(char);
      }
      const characters=new Set<string>();
      for(const word of new Set(words)){
        for(const char of word)if(/\p{Script=Han}/u.test(char))characters.add(char);
        if(Array.from(word).length>1 && !aided.has(word) && !testedWords.has(word))adjustStoryStrength(db,storyId,word,targets.has(word)?focusPoints:1,now);
      }
      for(const char of characters){
        if(!blocked.has(char))adjustStoryStrength(db,storyId,char,targets.has(char)?focusPoints:1,now);
        else if(!words.includes(char) && strengthFor(db,'character',char).score===null)adjustStoryStrength(db,storyId,char,0,now);
      }
      const completed=db.prepare('SELECT COUNT(*) AS total FROM chapter_completions WHERE story_id=?').get(storyId);
      if(Number(completed?.total)===story.chapters.length)db.prepare('INSERT OR IGNORE INTO story_completions VALUES(?,?)').run(storyId,now);
    }
    if(ownsTransaction)db.exec('COMMIT');
  }catch(error){if(ownsTransaction)db.exec('ROLLBACK');throw error;}
  return completionFor(store,storyId);
}
