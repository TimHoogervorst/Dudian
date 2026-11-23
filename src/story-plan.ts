import { targetWordCount } from './pace.ts';
import { vocabularyFor } from './vocabulary-plan.ts';
import { HttpError, type ReadingStore } from './store.ts';

export const difficulties = ['easy','medium','hard'] as const;
export type Difficulty = typeof difficulties[number];
export interface Preferences {difficulty:Difficulty; ceilings:Record<Difficulty,number>}
export interface StoryPlan {
  difficulty: Difficulty;
  minutes: 10 | 30;
  chapterCount: number;
  targetWords: number;
  ceiling: number;
  background: string[];
  newWords: string[];
  newCharacters: string[];
  reviewWords: string[];
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

export function buildPlan(store: ReadingStore,difficulty: Difficulty,minutes: 10 | 30,now=Date.now()): StoryPlan {
  if (!difficulties.includes(difficulty) || ![10,30].includes(minutes)) throw new HttpError(400,'Choose a story length and difficulty.');
  const ceiling = getPreferences(store).ceilings[difficulty];
  return {difficulty,minutes,chapterCount:minutes===30 ? 3 : 1,targetWords:targetWordCount(store,minutes),
    ceiling,...vocabularyFor(store,ceiling,now)};
}
