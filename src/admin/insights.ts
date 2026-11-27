import {focusBudget} from '../story-difficulty.ts';
import type { Pool } from 'pg';
import {storySubjects} from '../practice-subjects.ts';
import {catalogBackground} from './jobs.ts';
import { transaction } from '../postgres/database.ts';
import { catalog,type ItemKind } from '../catalog.ts';
import { perfectScore } from '../encounters.ts';
import { progressForScores,statusScores } from '../strength.ts';
import { storyFocusEntries } from '../story-focus.ts';
import type { Story } from '../store.ts';
import { difficulties,type Difficulty } from '../story-plan.ts';

const month=30*86400000;
const characters=catalog.list('character').filter(item=>/^\p{Script=Han}$/u.test(item.text));
export const dictionary=characters.map(item=>{
  const sense=catalog.studySense(item.text);
  return {...item,pinyin:sense?.pinyin??'',meaning:sense?.meaning??''};
});

function catalogStory(story:Story){
  const targets=storyFocusEntries(story.preview).filter(item=>item.strong).map(item=>item.text);
  const chapterTargets=story.chapters.flatMap(chapter=>chapter.focus??[]);
  const focus=[...new Set([...targets,...chapterTargets].filter(text=>/^\p{Script=Han}$/u.test(text)))];
  const vocabulary=new Set(story.chapters.flatMap(ch=>ch.paragraphs.flat()).flatMap(t=>t.cast?[]:[...(t.entry??t.text)].filter(c=>/\p{Script=Han}/u.test(c))));
  const levels=[...vocabulary].map(c=>catalog.characterLevel(c)??7);
  const band=story.targetBand??(levels.length?Math.max(...levels):null);
  return {id:story.id,title:story.title,focus,band,difficulty:story.difficulty??null};
}

export async function insights(pool:Pool,now=Date.now()){
  return transaction(pool,async db=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const accounts=await db.query(`WITH active AS (
      SELECT account_id FROM reading_advances WHERE at BETWEEN $1 AND $2
      UNION SELECT account_id FROM reading_intervals WHERE "end" BETWEEN $1 AND $2
      UNION SELECT account_id FROM word_actions WHERE at BETWEEN $1 AND $2
      UNION SELECT account_id FROM flashcard_reviews WHERE graded_at BETWEEN $1 AND $2
      UNION SELECT account_id FROM chapter_completions WHERE at BETWEEN $1 AND $2
      UNION SELECT account_id FROM story_completions WHERE at BETWEEN $1 AND $2
      UNION SELECT account_id FROM score_tracking WHERE last_milestone_practice BETWEEN $1 AND $2
      UNION SELECT account_id FROM score_changes WHERE manual=0 AND at BETWEEN $1 AND $2
    ) SELECT a.id, active.account_id IS NOT NULL AS active,
      coalesce((SELECT max(level) FROM milestone_passes WHERE account_id=a.id),0)+1 AS band,
      p.preferences->>'difficulty' AS difficulty FROM accounts a LEFT JOIN active ON a.id=active.account_id
      LEFT JOIN story_preferences p ON p.account_id=a.id`,[now-month,now]);
    type Score={kind:ItemKind,text:string,score:number};
    const scores=new Map<string,Score[]>();
    const averages=new Map<string,{sum:number,count:number}>();
    for(const row of (await db.query('SELECT account_id,kind,text,score::float8 FROM reading_strength')).rows){
      const list=scores.get(row.account_id)??[];
      list.push({kind:row.kind,text:row.text,score:row.score});
      scores.set(row.account_id,list);
      if(row.kind==='character'){
        const avg=averages.get(row.text)??{sum:0,count:0};
        avg.count++;avg.sum+=row.score;averages.set(row.text,avg);
      }
    }
    async function groups(sql:string,values:number[]=[]){
      const groups=new Map<string,Set<string>>();
      for(const {account_id,value} of (await db.query(sql,values)).rows){
        const set=groups.get(account_id)??new Set<string>();
        set.add(value);groups.set(account_id,set);
      }
      return groups;
    }
    const seen=await groups('SELECT account_id,text AS value FROM milestone_characters');
    const unavailable=await groups('SELECT account_id,story_id AS value FROM story_completions UNION SELECT account_id,story_id FROM hidden_stories');
    const due=await groups('SELECT account_id,text AS value FROM item_encounters WHERE due_at<=$1',[now]);
    const stories=(await db.query('SELECT content FROM stories ORDER BY created_at DESC,id')).rows.map(row=>catalogStory(row.content));
    const storyIndex=new Map<string,typeof stories>();
    for(const story of stories)for(const char of story.focus){
      const list=storyIndex.get(char)??[];list.push(story);storyIndex.set(char,list);
    }
    const population=()=>({count:0,progress:0,levels:Array<number>(7).fill(0)});
    const all=population(),active=population();
    const suggestions=new Map<string,{character:string,band:number,difficulty:Difficulty,review:number,first:number,total:number}>();
    for(const account of accounts.rows){
      const records=scores.get(account.id)??[],band=Math.min(7,account.band);
      const progress=Math.min(band,progressForScores(records));
      for(const group of account.active?[all,active]:[all]){
        group.count++;group.progress+=progress;group.levels[band-1]++;
      }
      if(!account.active)continue;
      const targetBand=Math.min(band,6);
      const withinBand=Math.max(0,progress-(targetBand-1));
      const inferred=withinBand<0.33?'easy':withinBand<0.67?'medium':'hard';
      const difficulty:Difficulty=difficulties.includes(account.difficulty)?account.difficulty:inferred;
      const charScores=new Map(records.filter(item=>item.kind==='character').map(item=>[item.text,item.score]));
      const nextCharacters=new Set(characters.filter(item=>item.level===targetBand &&
        !charScores.has(item.text)&&!seen.get(account.id)?.has(item.text)).slice(0,12).map(item=>item.text));
      if(targetBand===1 && !records.length && !seen.get(account.id)?.size){
        nextCharacters.clear();
        for(const char of '我是你好吗')nextCharacters.add(char);
      }
      for(const {text,level} of characters){
        if(level>targetBand)continue;
        const score=charScores.get(text);
        const encountered=score!==undefined||seen.get(account.id)?.has(text);
        const review=encountered && ((score??0)<statusScores.green || (score!<perfectScore && due.get(account.id)?.has(text)));
        if(!review && (encountered || !nextCharacters.has(text)))continue;
        const covered=storyIndex.get(text)?.some(story=>story.difficulty===difficulty && story.band!==null &&
          story.band<=targetBand && !unavailable.get(account.id)?.has(story.id));
        if(covered)continue;
        const key=[text,targetBand,difficulty].join('/');
        const suggestion=suggestions.get(key)??{character:text,band:targetBand,difficulty,review:0,first:0,total:0};
        if(review)suggestion.review++;else suggestion.first++;
        suggestion.total++; suggestions.set(key,suggestion);
      }
    }
    for(const group of [all,active])if(group.count)group.progress/=group.count;
    const focusBudgets=Object.fromEntries(difficulties.map(d=>[d,Array.from({length:6},(_,i)=>focusBudget(d,i+1))]));
    return {all,active,stories,focusBudgets,subjects:storySubjects,background:catalogBackground,characters:dictionary.map(item=>{
      const avg=averages.get(item.text);
      return {...item,average:avg?avg.sum/avg.count:null,scored:avg?.count??0,stories:storyIndex.get(item.text)?.length??0};
    }),suggestions:[...suggestions.values()].sort((a,b)=>b.total-a.total||b.review-a.review||a.band-b.band||a.character.localeCompare(b.character)||a.difficulty.localeCompare(b.difficulty))};
  });
}
