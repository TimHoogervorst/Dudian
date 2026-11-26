import {articleDocuments,readingOptions,type ReadingType} from './reading-types.ts';
import {randomUUID} from 'node:crypto';
import {encounterFor,perfectScore} from './encounters.ts';
import {catalog,entryKind} from './catalog.ts';
import {buildPlan,chapterFocus,difficulties,validLength,type Difficulty,type StoryPlan} from './story-plan.ts';
import {lengthBudget,storyDifficulty} from './story-difficulty.ts';
import {strengthFor,hskReadingProgress} from './strength.ts';
import {milestoneProgress} from './milestone-progress.ts';
import {HttpError,type ReadingStore} from './store.ts';

import {suggestSubjects,type Subject} from './practice-subjects.ts';
import {personalizeCharacters} from './practice-characters.ts';

type Focus={word:string;role:'new'|'review'|'compound';characters:string[]};
type Draft={options:ReturnType<typeof readingOptions>;plan:StoryPlan;focus:Focus[];excluded:string[];subjects:Subject[]};
const lastSubjects=new WeakMap<ReadingStore,Subject[]>();
const drafts=new WeakMap<ReadingStore,Map<string,Draft>>();
function draftFor(store:ReadingStore,id:string){
  const draft=drafts.get(store)?.get(id);
  if(!draft)throw new HttpError(409,'This practice preview expired. Refresh Practice for a new selection.');
  return draft;
}

export function confirmedPlan(store:ReadingStore,id:string,difficulty:Difficulty,chapterCount:number,subjectId?:string){
  const {plan,subjects}=draftFor(store,id);
  if(plan.difficulty!==difficulty || plan.chapterCount!==chapterCount)throw new HttpError(409,'The selection changed. Refresh the practice preview.');
  if(subjectId==='open')return {...plan,subject:undefined};
  const subject=subjectId===undefined?subjects[0]:subjects.find(item=>item.zh===subjectId);
  if(!subject)throw new HttpError(400,'Choose a subject from this preview.');
  return {...plan,subject};
}

function targets(plan:StoryPlan):Focus[]{
  const focus:Focus[]=plan.reviewWords.map(word=>({word,role:'review',characters:(plan.reviewCharacters??[]).filter(c=>word.includes(c))}));
  if(plan.compound)focus.push({word:plan.compound,role:'compound',characters:[]});
  for(const word of plan.newWords)focus.push({word,role:'new',characters:plan.newCharacters.filter(c=>word.includes(c))});
  return focus;
}

function backgroundTarget(store:ReadingStore,plan:StoryPlan,excluded:Set<string>):Focus|undefined{
  const cooling=new Set(store.db.prepare("SELECT DISTINCT word FROM word_actions WHERE kind='difficulty' AND at>?").all(Date.now()-86400000).map(row=>row.word));
  const word=plan.background.find(w=>!excluded.has(w) && !cooling.has(w) && strengthFor(store.db,'word',w).score!==perfectScore && catalog.get('word',w));
  if(word)return {word,role:'review',characters:[]};
}

export function practicePreview(store:ReadingStore,options:{difficulty:Difficulty;chapterCount:number;previewId?:string;reroll?:string;type?:ReadingType}){
  const {difficulty,chapterCount,previewId,reroll}=options;
  if(!difficulties.includes(difficulty)||!validLength(chapterCount))throw new HttpError(400,'Choose a story length and difficulty.');
  const previous=previewId?draftFor(store,previewId):undefined;
  let plan:StoryPlan;
  let focus:Focus[];
  const excluded=new Set(previous?.plan.difficulty===difficulty?previous.excluded:[]);
  const makePlan=(skip:Set<string>)=>personalizeCharacters(store,buildPlan(store,difficulty,chapterCount,Date.now(),skip),skip);
  if(previous && previous.plan.difficulty===difficulty && previous.plan.chapterCount===chapterCount){
    plan={...previous.plan};
    focus=[...previous.focus];
    if(reroll!==undefined){
      const i=focus.findIndex(item=>item.word===reroll);
      if(i<0)throw new HttpError(400,'Select a focus card to reroll.');
      const old=focus[i];
      const reserved=new Set([...excluded,...focus.flatMap(item=>[item.word,...item.characters])]);
      const alternate=targets(makePlan(reserved))
        .filter(item=>!reserved.has(item.word) && item.characters.every(c=>!reserved.has(c)))
        .filter(item=>{
          if(!plan.characters||item.role==='review')return true;
          const proposed=focus.map((current,index)=>index===i?item:current);
          const available=new Set(plan.characters.available+proposed.filter(f=>f.role==='review').map(f=>f.word).join(''));
          const extra=[...new Set(proposed.map(f=>f.word).join(''))].filter(c=>!available.has(c));
          return extra.length<=plan.ceiling && extra.every(c=>catalog.characterLevel(c)===plan.characters!.passed+1);
        });
      const next=alternate.find(item=>item.role===old.role && (item.role!=='new'||item.characters.length<=old.characters.length))
        ??alternate.find(item=>item.role==='review')??backgroundTarget(store,plan,reserved);
      if(!next)throw new HttpError(409,'No more eligible replacements for this card.');
      focus[i]=next;
      excluded.add(old.word);
      for(const c of old.characters)excluded.add(c);
    }
  }else{
    plan=makePlan(excluded);
    focus=targets(plan).slice(0,lengthBudget(storyDifficulty[difficulty].focusCards,plan.chapterCount));
    if(previous?.plan.difficulty===difficulty){
      const priorOrder=new Map(previous.focus.map((item,i)=>[item.word,i]));
      focus.sort((a,b)=>(priorOrder.get(a.word)??Infinity)-(priorOrder.get(b.word)??Infinity));
    }
    while(focus.length<2){
      const extra=backgroundTarget(store,plan,new Set([...excluded,...focus.map(item=>item.word)]));
      if(!extra)break;
      focus.push(extra);
    }
  }
  const words=(role:Focus['role'])=>focus.filter(item=>item.role===role).map(item=>item.word);
  const characters=(role:Focus['role'])=>[...new Set(focus.filter(item=>item.role===role).flatMap(item=>item.characters))];
  plan={...plan,newWords:words('new'),newCharacters:characters('new'),reviewWords:words('review'),reviewCharacters:characters('review'),compound:words('compound')[0]};
  const schedule=chapterFocus(plan);
  const projected=new Map<string,number>();
  function estimate(text:string){
    const kind=entryKind('word',text);
    const {color,score}=strengthFor(store.db,kind,text);
    const before=score??0;
    const due=encounterFor(store.db,text).dueAt;
    const chapters=schedule.filter(group=>group.some(word=>word===text||(kind==='character'&&word.includes(text)))).length;
    const after=due!==null && due<=Date.now()?before:Math.min(perfectScore,before+storyDifficulty[difficulty].points*chapters);
    projected.set(text,after);
    const sense=catalog.get(kind,text)?.senses[0];
    return {text,kind,color,gain:Math.round((after-before)*1000)/1000,pinyin:sense?.pinyin,meaning:sense?.meaning};
  }
  const cards=focus.map(item=>{
    const word=estimate(item.word);
    const characters=(catalog.get(word.kind,item.word)?.components??[]).map(({text,pinyin})=>{
      const senses=catalog.get('character',text)?.senses??[];
      const sense=senses.find(s=>s.pinyin.toLowerCase()===pinyin.toLowerCase());
      const gain=item.characters.includes(text)?estimate(text).gain:undefined;
      return {text,pinyin,meaning:sense?.meaning,color:strengthFor(store.db,'character',text).color,gain};
    });
    return {...word,characters};
  });
  const cache=drafts.get(store)??new Map<string,Draft>();
  if(cache.size>=256)cache.delete(cache.keys().next().value!);
  const id=randomUUID();
  const level=hskReadingProgress(store.db);
  const subjects=previous?.subjects??suggestSubjects(level,focus.flatMap(item=>[item.word,...item.characters]),lastSubjects.get(store)??[]);
  if(!previous)lastSubjects.set(store,subjects);
  const optionsForType=readingOptions(level,previous?.options.people);
  const type=options.type??previous?.plan.format?.type??'book';
  if(type==='book')plan.format={type,stage:optionsForType.stage};
  else if(type==='article')plan.format={type,documents:articleDocuments(level,plan.chapterCount)};
  else if(type==='dialogue')plan.format={type,people:optionsForType.people};
  else throw new HttpError(400,'Unknown reading type.');
  cache.set(id,{options:optionsForType,plan,focus,subjects,excluded:[...excluded]});drafts.set(store,cache);
  const progress=milestoneProgress(store.db,level);
  return {id,options:optionsForType,cards,subjects,...progress,projected:Math.min(progress.passed+1,hskReadingProgress(store.db,projected))};
}
