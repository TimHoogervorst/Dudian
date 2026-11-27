import type { LearnerDatabase } from './postgres/learner-database.ts';
import { catalog,entryKind,type ItemKind } from './catalog.ts';
import { storedExample } from './flashcard-example.ts';
import { perfectScore } from './encounters.ts';
import { reviewCandidates } from './strength.ts';
import { HttpError } from './store.ts';

type Target={text:string;kind:ItemKind;pinyin:string;meaning:string;senseId?:string};
export type Exercise={type:'choice'|'match';targets:Target[];options:string[]};
export type PracticeRequest={kind:'word'|'character'|'mixed';level?:number;words?:string[]};

function shuffle<T>(items:T[]){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
function target(text:string):Target{
  const kind=entryKind('word',text);
  const sense=catalog.studySense(text);
  if(!sense)throw new HttpError(400,'Unknown practice entry.');
  return {kind,text,pinyin:sense.pinyin,meaning:sense.meaning,senseId:sense.id};
}
function gloss(meaning:string){
  return meaning.toLowerCase().replace(/\([^)]*\)/g,'').trim().replace(/^(?:to|a|an|the) /,'').trim();
}
function senses(item:Target){
  return new Set(catalog.get(item.kind,item.text)!.senses.flatMap(s=>[s.meaning,...s.meaning.split(/[;,]/)].map(gloss)));
}
function distinct(group:Target[],item:Target){
  const meanings=senses(item);
  return group.every(other=>!meanings.has(gloss(other.meaning))&&!senses(other).has(gloss(item.meaning))&&other.text!==item.text);
}
function pool(level:number){
  return [...catalog.libraryItems('word',level),...catalog.libraryItems('character',level)].map(i=>i.text);
}
export async function candidates(db:LearnerDatabase,level:number,excluded:string[]){
  const scores=new Map((await reviewCandidates(db,Date.now())).map(i=>[i.text,i]));
  const skip=new Set(excluded);
  const now=Date.now();
  return shuffle(pool(level)).filter(text=>!skip.has(text)&&scores.get(text)?.score!==perfectScore).map(text=>{
    const item=scores.get(text);
    return {text,score:item?.score??5.5,due:item&&item.dueAt<=now?item.dueAt:Infinity};
  });
}
function matchingExercise(texts:Iterable<string>):Exercise|undefined{
  const group:Target[]=[];
  for(const text of texts){
    const item=target(text);
    if(distinct(group,item))group.push(item);
    if(group.length===5)break;
  }
  if(group.length>=2)return {type:'match',targets:group,options:shuffle(group.map(i=>i.meaning))};
}

function meaningChoice(text:string,alternatives:string[]):Exercise{
  const item=target(text);
  const choices=[item];
  for(const text of shuffle(alternatives)){
    const other=target(text);
    if(distinct(choices,other))choices.push(other);
    if(choices.length===6)break;
  }
  return {type:'choice',targets:[item],options:shuffle(choices.map(i=>i.meaning))};
}

export async function exerciseView(db:LearnerDatabase,exercise:Exercise,hskLimit?:number){
  const item=exercise.targets[0];
  const example=exercise.type==='choice'?await storedExample(db,item.kind,item.text,item):undefined;
  const showExample=example&&(!hskLimit||catalog.usesCharactersThrough(example.before+example.target+example.after,hskLimit));
  return {type:exercise.type,options:exercise.options,example:showExample?example:undefined,targets:exercise.targets.map(({text,pinyin})=>({text,pinyin}))};
}

export function checkExercise(exercise:Exercise,answers:number[]){
  if(!Array.isArray(answers)||answers.length!==exercise.targets.length||new Set(answers).size!==answers.length||
     answers.some(i=>!Number.isInteger(i)||i<0||i>=exercise.options.length))
    throw new HttpError(400,'Choose one meaning for every entry.');
  return exercise.targets.map((target,row)=>{
    const chosen=exercise.options[answers[row]];
    return {text:target.text,chosen,meaning:target.meaning,correct:chosen===target.meaning};
  });
}

export function planMilestoneWordPractice(level:number){
  const options=shuffle(pool(level).filter(text=>{
    const sense=catalog.studySense(text);
    return sense&&catalog.usesCharactersThrough(sense.meaning,level);
  }));
  const remaining=new Set(options);
  return function nextSection(){
    return Array.from({length:5},(_,index)=>{
      const exercise=(index===2?matchingExercise(remaining):undefined)
        ??meaningChoice(remaining.values().next().value!,options);
      for(const item of exercise.targets)remaining.delete(item.text);
      return exercise;
    });
  };
}

export async function planExercises(db:LearnerDatabase,request:PracticeRequest,excluded:string[]=[],extension=false){
  const {level=1,words,kind}=request;
  if(!['word','character','mixed'].includes(kind)||!Number.isInteger(level)||level<1||level>6)
    throw new HttpError(400,'Choose a valid practice level.');
  if(words!==undefined&&(!Array.isArray(words)||!words.length||words.some(w=>typeof w!=='string'||!catalog.get(kind==='character'?'character':'word',w))))
    throw new HttpError(400,'Choose valid practice entries.');
  const available=(await candidates(db,level,excluded)).filter(i=>kind==='mixed'||entryKind('word',i.text)===kind);
  const ranked=available.sort((a,b)=>a.score-b.score||a.due-b.due);
  const due=ranked.filter(i=>Number.isFinite(i.due)).sort((a,b)=>a.due-b.due);
  const remaining=new Set(words??(extension?due:ranked).map(i=>i.text));
  const optionLevel=words?.length?catalog.get(entryKind('word',words[0]),words[0])?.level??level:level;
  const options=pool(optionLevel);
  const exercises:Exercise[]=[];
  while(remaining.size&&(words||exercises.length<10)){
    const n=exercises.length;
    const match=remaining.size>=2&&(words?n%3===0&&remaining.size>=3:n===2||n===6);
    const overdueFirst=new Set([...due.filter(i=>remaining.has(i.text)).map(i=>i.text),...remaining]);
    const board=match?matchingExercise(overdueFirst):undefined;
    if(board){
      for(const item of board.targets)remaining.delete(item.text);
      exercises.push(board);
    }else{
      // Alternate kinds when their best available targets have equal priority.
      const first=remaining.values().next().value!;
      const best=ranked.find(i=>i.text===first);
      const preferred=n%2?'word':'character';
      const picked=!words&&!extension&&best?ranked.find(i=>remaining.has(i.text)&&i.score===best.score&&i.due===best.due&&entryKind('word',i.text)===preferred)?.text:undefined;
      const text=picked??first;
      remaining.delete(text);
      exercises.push(meaningChoice(text,options));
    }
  }
  return exercises;
}
