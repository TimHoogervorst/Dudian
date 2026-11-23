import type {DatabaseSync} from 'node:sqlite';
import {ReadingStore,HttpError} from './store.ts';
import {adjustStrength,strengthFor} from './strength.ts';
import {ensureActions} from './word-actions.ts';

export function ensureCompletions(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS chapter_completions(
    story_id TEXT NOT NULL REFERENCES stories(id),chapter INTEGER NOT NULL,at INTEGER NOT NULL,
    word_count INTEGER NOT NULL,PRIMARY KEY(story_id,chapter));
    CREATE TABLE IF NOT EXISTS story_completions(story_id TEXT PRIMARY KEY REFERENCES stories(id),at INTEGER NOT NULL);`);
}
export function completionFor(store:ReadingStore,storyId:string) {
  ensureCompletions(store.db);
  const chapters=store.db.prepare('SELECT chapter FROM chapter_completions WHERE story_id=? ORDER BY chapter').all(storyId);
  return {chapters:chapters.map(row=>Number(row.chapter)),finished:!!store.db.prepare('SELECT 1 FROM story_completions WHERE story_id=?').get(storyId)};
}
export function finishChapter(store:ReadingStore,storyId:string,chapter:number,now=Date.now()) {
  const story=store.story(storyId);
  if(!Number.isInteger(chapter)||!story.chapters[chapter])throw new HttpError(400,'Choose a chapter in this story.');
  const words=story.chapters[chapter].paragraphs.flat().map(t=>t.text).filter(t=>/\p{Script=Han}/u.test(t));
  const db=store.db;
  ensureActions(db);
  ensureCompletions(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const first=db.prepare('INSERT OR IGNORE INTO chapter_completions VALUES(?,?,?,?)').run(storyId,chapter,now,words.length);
    if(first.changes) {
      const aided=new Set(db.prepare('SELECT DISTINCT word FROM word_actions WHERE story_id=? AND chapter=?').all(storyId,chapter).map(row=>row.word));
      for(const word of new Set(words)) {
        if(!aided.has(word)) {
          adjustStrength(db,'word',word,1);
          if(Array.from(word).length===1)adjustStrength(db,'character',word,1);
        }
        if(Array.from(word).length>1) {
          for(const character of new Set(word)) {
            if(strengthFor(db,'character',character).score===null)adjustStrength(db,'character',character,0);
          }
        }
      }
      const completed=db.prepare('SELECT COUNT(*) AS total FROM chapter_completions WHERE story_id=?').get(storyId);
      if(Number(completed?.total)===story.chapters.length)db.prepare('INSERT OR IGNORE INTO story_completions VALUES(?,?)').run(storyId,now);
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return completionFor(store,storyId);
}
