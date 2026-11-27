import { catalog } from './catalog.ts';
import { nextTestLevel } from './milestone-progress.ts';
import { recordedStrengths } from './strength.ts';
import type { ReadingStore } from './store.ts';
import type { StoryPlan } from './story-plan.ts';

const starter = '我是你好吗';
export interface PracticeCharacters {
  passed:number;
  familiar:string;
  available:string;
  beginner:boolean;
}

export async function personalizeCharacters(store:ReadingStore, plan:StoryPlan, excluded:ReadonlySet<string>) {
  const scores=await recordedStrengths(store.db);
  const passed=await nextTestLevel(store.db)-1;
  const beginner=passed===0 && !scores.some(item=>item.score!==0);
  const familiar=scores.filter(item=>item.kind==='character' && item.score>=6).map(item=>item.text);
  const available=new Set(catalog.list('character').filter(item=>item.level<=passed).map(item=>item.text));
  for(const char of familiar)available.add(char);
  if(beginner){
    for(const char of starter)available.add(char);
    const targets=[...starter].filter(c=>!excluded.has(c)).slice(0,2);
    return {...plan,background:[...starter],newWords:targets,newCharacters:targets,reviewWords:[],reviewCharacters:[],compound:undefined,
      characters:{passed,familiar:'',available:[...available].join(''),beginner}};
  }
  // Previously encountered starter characters can support the next story while still learning.
  const seen=await store.db.prepare('SELECT text FROM milestone_characters WHERE strpos($1,text)>0').all(starter);
  for(const {text} of seen)available.add(String(text));
  for(const item of scores)if(item.kind==='word'&&item.score>=6){
    for(const c of item.text)available.add(c);
  }
  const base=[...available].join('');
  // Previously practiced words can supply background and reviews, including their components.
  const practiced=new Set(scores.map(item=>item.text));
  const reviewWords=plan.reviewWords.filter(word=>practiced.has(word)||[...word].every(c=>available.has(c)));
  for(const word of reviewWords)for(const c of word)available.add(c);
  const newCharacters=new Set<string>();
  function fits(word:string){
    const novel=[...word].filter(c=>!available.has(c));
    if(novel.some(c=>catalog.characterLevel(c)!==passed+1) ||
      new Set([...newCharacters,...novel]).size>plan.ceiling)return false;
    for(const c of novel)newCharacters.add(c);
    return true;
  }
  const newWords=plan.newWords.filter(fits);
  const compound=plan.compound && fits(plan.compound)?plan.compound:undefined;
  const background=plan.background.filter(word=>[...word].every(c=>base.includes(c)));
  for(const c of plan.newCharacters){
    if(catalog.characterLevel(c)===passed+1 && newWords.some(word=>word.includes(c)))newCharacters.add(c);
  }
  return {...plan,newWords,newCharacters:[...newCharacters],compound,background,reviewWords,
    reviewCharacters:plan.reviewCharacters?.filter(c=>reviewWords.some(w=>w.includes(c))),
    characters:{passed,familiar:familiar.filter(c=>(catalog.characterLevel(c)??Infinity)>passed).join(''),
      available:base,beginner}};
}
