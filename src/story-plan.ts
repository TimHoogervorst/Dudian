import { vocabularyFor } from './vocabulary-plan.ts';
import { HttpError, type ReadingStore } from './store.ts';

export const difficulties = ['easy','medium','hard'] as const;
export type Difficulty = typeof difficulties[number];
export const chapterCounts = {10:1,20:2,30:5} as const;
export type StoryLength = keyof typeof chapterCounts;
export const paragraphCounts = {easy:[1,1],medium:[2,2],hard:[3,4]} as const;
export function validLength(value:unknown): value is StoryLength {
  return typeof value==='number' && Object.hasOwn(chapterCounts,value);
}
export interface Preferences {difficulty:Difficulty; ceilings:Record<Difficulty,number>}
export interface StoryPlan {
  format?:import('./reading-types.ts').ReadingFormat;
  subject?:import('./practice-subjects.ts').Subject;
  difficulty: Difficulty;
  minutes: StoryLength;
  chapterCount: number;
  targetWords: number;
  ceiling: number;
  background: string[];
  newWords: string[];
  newCharacters: string[];
  reviewWords: string[];
  reviewCharacters?: string[];
  strongCharacters?: number;
  compound?: string;
}

function ensurePreferences(store: ReadingStore) {
  store.db.exec('CREATE TABLE IF NOT EXISTS story_preferences (learner INTEGER PRIMARY KEY REFERENCES learners(id), preferences TEXT NOT NULL)');
}
export function getPreferences(store: ReadingStore): Preferences {
  ensurePreferences(store);
  const row = store.db.prepare('SELECT preferences FROM story_preferences WHERE learner=1').get();
  return row ? JSON.parse(String(row.preferences)) : {difficulty:'easy',ceilings:{easy:2,medium:3,hard:5}};
}
export function setPreferences(store: ReadingStore, input: Preferences) {
  if (!input || !difficulties.includes(input.difficulty) || !difficulties.every(key =>
    Number.isSafeInteger(input.ceilings?.[key]) && input.ceilings[key] >= 0)) {
    throw new HttpError(400,'Choose a difficulty and whole-number character ceilings of zero or more.');
  }
  const {easy,medium,hard} = input.ceilings;
  const preferences = {difficulty:input.difficulty,ceilings:{easy,medium,hard}};
  ensurePreferences(store);
  store.db.prepare('INSERT INTO story_preferences VALUES(1,?) ON CONFLICT(learner) DO UPDATE SET preferences=excluded.preferences').run(JSON.stringify(preferences));
  return preferences;
}

export function buildPlan(store: ReadingStore,difficulty: Difficulty,minutes: StoryLength,now=Date.now(),excluded?:ReadonlySet<string>): StoryPlan {
  if (!difficulties.includes(difficulty) || !validLength(minutes)) throw new HttpError(400,'Choose a story length and difficulty.');
  const ceiling = getPreferences(store).ceilings[difficulty];
  const chapterCount=chapterCounts[minutes];
  const [min,max]=paragraphCounts[difficulty];
  return {difficulty,minutes,chapterCount,targetWords:chapterCount*(min+max)/2*40,
    ceiling,...vocabularyFor(store,difficulty,ceiling,now,excluded)};
}
