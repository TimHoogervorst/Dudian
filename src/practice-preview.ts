import {randomUUID} from 'node:crypto';
import {encounterFor,perfectScore} from './encounters.ts';
import {catalog,entryKind} from './catalog.ts';
import {buildPlan,chapterCounts,difficulties,validLength,type Difficulty,type StoryLength,type StoryPlan} from './story-plan.ts';
import {storyDifficulty} from './story-difficulty.ts';
import {strengthFor,hskReadingProgress} from './strength.ts';
import {HttpError,type ReadingStore} from './store.ts';

import {suggestSubjects,type Subject} from './practice-subjects.ts';

type Focus={word:string;role:'new'|'review'|'compound';characters:string[]};
type Draft={plan:StoryPlan;focus:Focus[];excluded:string[];subjects:Subject[]};
const lastSubjects=new WeakMap<ReadingStore,Subject[]>();
const drafts=new WeakMap<ReadingStore,Map<string,Draft>>();
function draftFor(store:ReadingStore,id:string){
  const draft=drafts.get(store)?.get(id);
  if(!draft)throw new HttpError(409,'This practice preview expired. Refresh Practice for a new selection.');
  return draft;
}

export function confirmedPlan(store:ReadingStore,id:string,difficulty:Difficulty,minutes:StoryLength,subjectId?:string){
  const {plan,subjects}=draftFor(store,id);
  if(plan.difficulty!==difficulty || plan.minutes!==minutes)throw new HttpError(409,'The selection changed. Refresh the practice preview.');
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

export function practicePreview(store:ReadingStore,options:{difficulty:Difficulty;minutes:StoryLength;previewId?:string;reroll?:string}){
  const {difficulty,minutes,previewId,reroll}=options;
  if(!difficulties.includes(difficulty)||!validLength(minutes))throw new HttpError(400,'Choose a story length and difficulty.');
  const previous=previewId?draftFor(store,previewId):undefined;
  let plan:StoryPlan;
  let focus:Focus[];
  const excluded=new Set(previous?.plan.difficulty===difficulty?previous.excluded:[]);
  if(previous && previous.plan.difficulty===difficulty){
    const chapterCount=chapterCounts[minutes];
    plan={...previous.plan,minutes,chapterCount,targetWords:previous.plan.targetWords/previous.plan.chapterCount*chapterCount};
    focus=[...previous.focus];
    if(reroll!==undefined){
      const i=focus.findIndex(item=>item.word===reroll);
      if(i<0)throw new HttpError(400,'Select a focus card to reroll.');
      const old=focus[i];
      const reserved=new Set([...excluded,...focus.flatMap(item=>[item.word,...item.characters])]);
      const alternate=targets(buildPlan(store,difficulty,minutes,Date.now(),reserved))
        .filter(item=>!reserved.has(item.word) && item.characters.every(c=>!reserved.has(c)));
      const next=alternate.find(item=>item.role===old.role && (item.role!=='new'||item.characters.length<=old.characters.length))
        ??alternate.find(item=>item.role==='review')??backgroundTarget(store,plan,reserved);
      if(!next)throw new HttpError(409,'No more eligible replacements for this card.');
      focus[i]=next;
      excluded.add(old.word);
      for(const c of old.characters)excluded.add(c);
    }
  }else{
    plan=buildPlan(store,difficulty,minutes);
    focus=targets(plan).slice(0,storyDifficulty[difficulty].focusCards);
    while(focus.length<2){
      const extra=backgroundTarget(store,plan,new Set(focus.map(item=>item.word)));
      if(!extra)break;
      focus.push(extra);
    }
  }
  const words=(role:Focus['role'])=>focus.filter(item=>item.role===role).map(item=>item.word);
  const characters=(role:Focus['role'])=>[...new Set(focus.filter(item=>item.role===role).flatMap(item=>item.characters))];
  plan={...plan,newWords:words('new'),newCharacters:characters('new'),reviewWords:words('review'),reviewCharacters:characters('review'),compound:words('compound')[0]};
  const projected=new Map<string,number>();
  function estimate(text:string){
    const kind=entryKind('word',text);
    const {color,score}=strengthFor(store.db,kind,text);
    const before=score??0;
    const due=encounterFor(store.db,text).dueAt;
    const after=due!==null && due<=Date.now()?before:Math.min(perfectScore,before+storyDifficulty[difficulty].points*plan.chapterCount);
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
  cache.set(id,{plan,focus,subjects,excluded:[...excluded]});drafts.set(store,cache);
  return {id,cards,subjects,level,projected:hskReadingProgress(store.db,projected)};
}
