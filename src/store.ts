import { DatabaseSync } from 'node:sqlite';
import { seedStory } from './seed.ts';

export interface Token { text: string; pinyin?: string; meaning?: string; entry?: string; sense?: string | number; sentence?: number }
export interface Story { id: string; title: string; chapters: { title: string; paragraphs: Token[][] }[] }
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
      CREATE TABLE IF NOT EXISTS positions(story_id TEXT PRIMARY KEY REFERENCES stories(id), chapter INTEGER NOT NULL, paragraph INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    `);
    if (!this.db.prepare('SELECT 1 FROM stories WHERE id=?').get(seedStory.id)) this.saveStory(seedStory);
  }
  saveStory(story: Story) {
    this.db.prepare('INSERT INTO stories VALUES(?,?,?,?)').run(story.id,story.title,JSON.stringify(story),Date.now());
    return story;
  }
  story(id: string): Story {
    const row = this.db.prepare('SELECT content FROM stories WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'Story not found.');
    return JSON.parse(String(row.content));
  }
  stories() {
    return this.db.prepare('SELECT id,title,created_at FROM stories ORDER BY created_at DESC,id').all();
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
