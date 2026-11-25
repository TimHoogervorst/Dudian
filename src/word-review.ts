import {randomInt} from 'node:crypto';
import {catalog} from './catalog.ts';
import type {ChapterQuestion,ReadingStore,Story} from './store.ts';
import type {StoryPlan} from './story-plan.ts';
import {strengthFor} from './strength.ts';
import {ensureActions} from './word-actions.ts';
import {encounterFor,perfectScore} from './encounters.ts';

export function reviewBoundaries(plan:StoryPlan){
  if(plan.chapterCount===1)return [0];
  return Array.from({length:Math.floor(plan.chapterCount/2)},(_,i)=>2*i+1);
}

export function planWordReviews(store:ReadingStore,plan:StoryPlan){
  const boundaries=reviewBoundaries(plan);
  const size={easy:2,medium:5,hard:10}[plan.difficulty];
  const focus=new Set([...plan.newWords,...plan.reviewWords,...(plan.compound?[plan.compound]:[])]);
  const chars=new Set([...plan.newCharacters,...plan.reviewCharacters??[],...[...focus].join('')]);
  ensureActions(store.db);
  const cooling=new Set(store.db.prepare("SELECT DISTINCT word FROM word_actions WHERE kind='difficulty' AND at>?")
    .all(Date.now()-86400000).map(row=>String(row.word)));
  const vocabulary=[...new Set([...focus,...plan.background])];
  const ranked=vocabulary.filter(word=>[...word].length>1 && !cooling.has(word) && catalog.get('word',word))
    .map(word=>({word,focus:focus.has(word),related:[...word].filter(c=>chars.has(c)).length,
      score:strengthFor(store.db,'word',word).score??5,dueAt:encounterFor(store.db,word).dueAt??Infinity,tie:Math.random()}))
    .filter(item=>item.score<perfectScore)
    .sort((a,b)=>Number(b.focus)-Number(a.focus)||b.related-a.related||a.score-b.score||b.tie-a.tie);
  const overdue=ranked.filter(item=>item.dueAt<=Date.now()).sort((a,b)=>a.dueAt-b.dueAt);
  const reserved=overdue.slice(0,boundaries.length).map(item=>item.word);
  const pool=[...new Set([...reserved,...ranked.map(item=>item.word)])].slice(0,size*boundaries.length);
  if(pool.length<size){
    for(const word of vocabulary){
      if(!pool.includes(word) && catalog.get('word',word))pool.push(word);
      if(pool.length===size)break;
    }
    if(pool.length<size)throw new Error('Too few distinct story words for a full practice round.');
  }
  return boundaries.map((chapter,i)=>{
    const assigned=pool.filter((_,index)=>index%boundaries.length===i);
    const words=[...assigned,...pool.filter(word=>!assigned.includes(word))].slice(0,size);
    return {chapter,words};
  });
}

function shuffled<T>(items:T[]){
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--){const j=randomInt(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
}

export function wordReviewCards(chapters:Story['chapters'],end:number,words:string[],round:number):ChapterQuestion[]{
  const occurrences=chapters.slice(0,end+1).flatMap((c,sourceChapter)=>c.paragraphs.flatMap((tokens,paragraph)=>
    tokens.map((item,token)=>({item,sourceChapter,paragraph,token}))));
  const entries=words.map(word=>occurrences.find(({item})=>item.entry===word && item.meaning)!);
  return shuffled(entries).map(({item,sourceChapter,paragraph,token})=>{
    const accepted=new Set(catalog.get('word',item.text)!.senses.map(s=>s.meaning.toLowerCase()));
    const alternatives=shuffled(entries.filter(other=>other.item!==item)).map(other=>other.item.meaning!);
    const distractors:string[]=[];
    for(const meaning of [...alternatives,'a lighthouse','an orchestra','a thunderstorm']){
      if(accepted.has(meaning.toLowerCase()))continue;
      distractors.push(meaning);accepted.add(meaning.toLowerCase());
      if(distractors.length===2)break;
    }
    const meanings=shuffled([item.meaning!,...distractors]);
    return {reviewRound:round,word:item.text,sense:item.sense!,characters:[],sourceChapter,paragraph,token,
      prompt:{zh:item.text,words:[item.text],en:item.meaning!},choices:meanings.map(en=>({zh:'',en})),correct:meanings.indexOf(item.meaning!)};
  });
}
