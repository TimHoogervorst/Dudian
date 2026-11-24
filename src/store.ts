import {coverTemplate} from './cover-template.ts';
import { DatabaseSync } from 'node:sqlite';
import { seedStory } from './seed.ts';
import {migrateEncounters} from './encounters.ts';
import {recoverCoverTokens} from './cover-text.ts';
import type {Difficulty} from './story-plan.ts';

export interface Token { text: string; pinyin?: string; meaning?: string; entry?: string; sense?: string | number; sentence?: number; cast?:'baobao' }
export interface QuizText { zh:string; words?:string[]; en:string }
export interface ChapterQuestion {
  reviewRound?:number; sourceChapter?:number;
  prompt:QuizText; choices:QuizText[]; correct:number; paragraph:number; token:number;
  word:string; sense:string|number; characters:string[];
}
export interface PreviewItem {text:string;pinyin?:string;meaning?:string;example?:string}
export interface Story { format?:import('./reading-types.ts').ReadingFormat; id: string; title: string; difficulty?:Difficulty; preview?:{wordReview?:PreviewItem[];characters:PreviewItem[];reviewCharacters?:string[]; words?:PreviewItem[];review:PreviewItem[];compound?:PreviewItem}; cover?:{reference?:boolean;teaser:string;prompt:string;tokens?:Token[]}; chapters: { speakers?:number[];names?:string[];sections?:string[]; title: string; paragraphs: Token[][]; translations?:(string|null)[]; questions?:ChapterQuestion[] }[] }
export interface Position { chapter: number; paragraph: number }
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export class ReadingStore {
  db: DatabaseSync;
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS learners(id INTEGER PRIMARY KEY, role TEXT NOT NULL);
      INSERT OR IGNORE INTO learners VALUES(1,'admin');
      CREATE TABLE IF NOT EXISTS stories(id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS story_completions(story_id TEXT PRIMARY KEY REFERENCES stories(id),at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pending_story_points(story_id TEXT NOT NULL REFERENCES stories(id),chapter INTEGER NOT NULL,
        text TEXT NOT NULL,gain REAL NOT NULL,loss REAL NOT NULL,PRIMARY KEY(story_id,chapter,text));
      CREATE TABLE IF NOT EXISTS story_awards(story_id TEXT PRIMARY KEY REFERENCES stories(id),incorrect INTEGER NOT NULL,
        multiplier REAL NOT NULL,base REAL NOT NULL,penalties REAL NOT NULL,awarded REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS story_character_points(story_id TEXT NOT NULL REFERENCES stories(id),character TEXT NOT NULL,points INTEGER NOT NULL,PRIMARY KEY(story_id,character));
      CREATE TABLE IF NOT EXISTS hidden_stories(story_id TEXT PRIMARY KEY REFERENCES stories(id));
      CREATE TABLE IF NOT EXISTS score_tracking(id INTEGER PRIMARY KEY CHECK(id=1),started_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS score_changes(
        kind TEXT NOT NULL,text TEXT NOT NULL,before_score INTEGER NOT NULL,after_score INTEGER NOT NULL,
        at INTEGER NOT NULL,manual INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS score_changes_time ON score_changes(at);
      CREATE TABLE IF NOT EXISTS positions(story_id TEXT PRIMARY KEY REFERENCES stories(id), chapter INTEGER NOT NULL, paragraph INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    `);
    this.db.prepare('INSERT OR IGNORE INTO score_tracking VALUES(1,?)').run(Date.now());
    if (!this.db.prepare('SELECT 1 FROM stories WHERE id=?').get(seedStory.id)) this.saveStory(seedStory);
    // Preserve the character status when both legacy entries were rated independently.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const exists=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
      if(exists.get('reading_strength'))this.db.exec(`
        INSERT OR IGNORE INTO reading_strength(kind,text,score)
          SELECT 'character',text,score FROM reading_strength WHERE kind='word' AND length(text)=1;
        DELETE FROM reading_strength WHERE kind='word' AND length(text)=1;`);
      if(exists.get('flashcard_reviews'))this.db.exec("UPDATE flashcard_reviews SET kind='character' WHERE kind='word' AND length(text)=1");
      migrateEncounters(this.db);
      if(!exists.get('milestone_characters')){
        this.db.exec(`CREATE TABLE milestone_characters(text TEXT PRIMARY KEY);
          CREATE TABLE milestone_progress(id INTEGER PRIMARY KEY, reached INTEGER NOT NULL, last_change INTEGER NOT NULL);
          INSERT INTO milestone_progress VALUES(1,0,0);
          CREATE TABLE milestone_tests(id TEXT PRIMARY KEY, level INTEGER NOT NULL, status TEXT NOT NULL,
            sections TEXT NOT NULL, answers TEXT NOT NULL DEFAULT '[]', mistakes INTEGER NOT NULL DEFAULT 0);
          CREATE UNIQUE INDEX milestone_active ON milestone_tests(level) WHERE status IN ('ready','active','passed')`);
        const insert=this.db.prepare('INSERT OR IGNORE INTO milestone_characters VALUES(?)');
        for(const row of this.db.prepare('SELECT text FROM item_encounters').all())
          for(const char of String(row.text))if(/\p{Script=Han}/u.test(char))insert.run(char);
      }
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  saveStory(story: Story) {
    this.db.prepare('INSERT INTO stories VALUES(?,?,?,?)').run(story.id,story.title,JSON.stringify(story),Date.now());
    return story;
  }
  story(id: string): Story {
    const row = this.db.prepare('SELECT content FROM stories WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'Story not found.');
    const story:Story=JSON.parse(String(row.content));
    if(story.cover && !story.cover.tokens){
      story.cover.tokens=recoverCoverTokens(story);
      this.db.prepare('UPDATE stories SET content=? WHERE id=?').run(JSON.stringify(story),id);
    }
    if(story.format && story.cover)Object.assign(story.cover,coverTemplate(story));
    return story;
  }
  stories() {
    return this.db.prepare('SELECT id,title,created_at FROM stories WHERE id NOT IN (SELECT story_id FROM hidden_stories) ORDER BY created_at DESC,id').all();
  }
  position(id: string): Position {
    const row = this.db.prepare('SELECT chapter,paragraph FROM positions WHERE story_id=?').get(id);
    return row ? { chapter:Number(row.chapter), paragraph:Number(row.paragraph) } : {chapter:0,paragraph:0};
  }
  move(id: string, chapter: number, paragraph: number) {
    const story = this.story(id);
    if (!Number.isInteger(chapter) || !Number.isInteger(paragraph) || !story.chapters[chapter]?.paragraphs[paragraph]) {
      throw new HttpError(400, 'Choose a paragraph in this story.');
    }
    this.db.prepare(`INSERT INTO positions VALUES(?,?,?,?)
      ON CONFLICT(story_id) DO UPDATE SET chapter=excluded.chapter, paragraph=excluded.paragraph, updated_at=excluded.updated_at`).run(id,chapter,paragraph,Date.now());
    return {chapter, paragraph};
  }
}
