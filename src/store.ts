import { coverTemplate } from './cover-template.ts';
import { LearnerDatabase } from './postgres/learner-database.ts';
import { recoverCoverTokens } from './cover-text.ts';
import type { Difficulty } from './story-plan.ts';

export interface Token { text: string; pinyin?: string; meaning?: string; entry?: string; sense?: string | number; sentence?: number; cast?:'baobao' }
export interface QuizText { zh:string; words?:string[]; en:string }
export interface ChapterQuestion {
  reviewRound?:number; sourceChapter?:number;
  prompt:QuizText; choices:QuizText[]; correct:number; paragraph:number; token:number;
  word:string; sense:string|number; characters:string[];
}
export interface PreviewItem {text:string;pinyin?:string;meaning?:string;example?:string}
export interface Story { targetBand?:number; format?:import('./reading-types.ts').ReadingFormat; id: string; title: string; difficulty?:Difficulty; preview?:{wordReview?:PreviewItem[];characters:PreviewItem[];reviewCharacters?:string[]; words?:PreviewItem[];review:PreviewItem[];compound?:PreviewItem}; cover?:{reference?:boolean;teaser:string;prompt:string;tokens?:Token[]}; chapters: { focus?:string[]; speakers?:number[];names?:string[];sections?:string[]; title: string; paragraphs: Token[][]; translations?:(string|null)[]; questions?:ChapterQuestion[] }[] }
export interface Position { chapter: number; paragraph: number }
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export class ReadingStore {
  readonly db: LearnerDatabase;
  constructor(db: LearnerDatabase) { this.db = db; }
  async saveStory(story: Story) {
    await this.db.prepare('INSERT INTO stories VALUES($1,$2,$3,$4)').run(story.id,story.title,JSON.stringify(story),Date.now());
    return story;
  }
  async story(id: string): Promise<Story> {
    const row = await this.db.prepare('SELECT content FROM stories WHERE id=$1').get(id);
    if (!row) throw new HttpError(404, 'Story not found.');
    const story:Story=JSON.parse(String(row.content));
    if(story.cover && !story.cover.tokens){
      story.cover.tokens=recoverCoverTokens(story);
      await this.db.prepare(`UPDATE stories SET content=jsonb_set(content,'{cover,tokens}',$1::jsonb)
        WHERE id=$2 AND content#>'{cover,tokens}' IS NULL`).run(JSON.stringify(story.cover.tokens),id);
    }
    if(story.format && story.cover)Object.assign(story.cover,coverTemplate(story));
    return story;
  }
  async stories() {
    return await this.db.prepare('SELECT id,title,created_at FROM stories WHERE id NOT IN (SELECT story_id FROM hidden_stories) ORDER BY created_at DESC,id').all();
  }
  async position(id: string): Promise<Position> {
    const row = await this.db.prepare('SELECT chapter,paragraph FROM positions WHERE story_id=$1').get(id);
    return row ? { chapter:Number(row.chapter), paragraph:Number(row.paragraph) } : {chapter:0,paragraph:0};
  }
  async move(id: string, chapter: number, paragraph: number) {
    const story = await this.story(id);
    if (!Number.isInteger(chapter) || !Number.isInteger(paragraph) || !story.chapters[chapter]?.paragraphs[paragraph]) {
      throw new HttpError(400, 'Choose a paragraph in this story.');
    }
    await this.db.prepare(`INSERT INTO positions(story_id,chapter,paragraph,updated_at) VALUES($1,$2,$3,$4)
      ON CONFLICT(account_id,story_id) DO UPDATE SET chapter=excluded.chapter, paragraph=excluded.paragraph, updated_at=excluded.updated_at`).run(id,chapter,paragraph,Date.now());
    return {chapter, paragraph};
  }
}
