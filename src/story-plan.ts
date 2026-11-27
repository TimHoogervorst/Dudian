import { vocabularyFor } from './vocabulary-plan.ts';
import { HttpError,type ReadingStore } from './store.ts';
import { lengthBudget,storyDifficulty } from './story-difficulty.ts';

export const difficulties = ['easy','medium','hard'] as const;
export type Difficulty = typeof difficulties[number];
export const paragraphCounts = {easy:[1,1],medium:[2,2],hard:[3,4]} as const;
export function validLength(value:unknown): value is number {
  return typeof value==='number' && Number.isInteger(value) && value>=1 && value<=6;
}
export interface Preferences {difficulty:Difficulty; ceilings:Record<Difficulty,number>}
export interface StoryPlan {
  characters?:import('./practice-characters.ts').PracticeCharacters;
  hskLimit?:number;
  format?:import('./reading-types.ts').ReadingFormat;
  subject?:import('./practice-subjects.ts').Subject;
  difficulty: Difficulty;
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

export function chapterFocus(plan:StoryPlan){
  const words=[...new Set([...plan.reviewWords,...(plan.compound?[plan.compound]:[]),...plan.newWords])];
  const count=plan.chapterCount;
  // For twelve targets and five chapters this yields 1–4, 3–6, 5–8, 7–10, 9–12.
  const width=count===1?words.length:Math.min(words.length,Math.max(2,Math.ceil((words.length-2)/count)+2));
  return Array.from({length:count},(_,chapter)=>{
    const start=count===1?0:Math.round(chapter*(words.length-width)/(count-1));
    return words.slice(start,start+width);
  });
}

export async function getPreferences(store: ReadingStore): Promise<Preferences> {

  const row = await store.db.prepare('SELECT preferences FROM story_preferences ').get();
  return row ? JSON.parse(String(row.preferences)) : {difficulty:'easy',ceilings:{easy:2,medium:3,hard:5}};
}
export async function setPreferences(store: ReadingStore, input: Preferences) {
  if (!input || !difficulties.includes(input.difficulty) || !difficulties.every(key =>
    Number.isSafeInteger(input.ceilings?.[key]) && input.ceilings[key] >= 0)) {
    throw new HttpError(400,'Choose a difficulty and whole-number character ceilings of zero or more.');
  }
  const {easy,medium,hard} = input.ceilings;
  const preferences = {difficulty:input.difficulty,ceilings:{easy,medium,hard}};

  await store.db.prepare('INSERT INTO story_preferences (preferences) VALUES($1) ON CONFLICT(account_id) DO UPDATE SET preferences=excluded.preferences').run(JSON.stringify(preferences));
  return preferences;
}

export function readingSize(difficulty:Difficulty,chapterCount:number){
  const [min,max]=paragraphCounts[difficulty];
  return {difficulty,chapterCount,targetWords:chapterCount*(min+max)/2*40};
}

export async function buildPlan(store: ReadingStore,difficulty: Difficulty,chapterCount: number,now=Date.now(),excluded?:ReadonlySet<string>): Promise<StoryPlan> {
  if (!difficulties.includes(difficulty) || !validLength(chapterCount)) throw new HttpError(400,'Choose a story length and difficulty.');
  const ceiling=lengthBudget((await getPreferences(store)).ceilings[difficulty],chapterCount);
  const focusLimit=lengthBudget(storyDifficulty[difficulty].focusCards,chapterCount);
  return {...readingSize(difficulty,chapterCount),ceiling,...await vocabularyFor(store,difficulty,ceiling,now,excluded,focusLimit)};
}
