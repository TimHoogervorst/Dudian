import type { LearnerDatabase } from './postgres/learner-database.ts';
import type { Story,ChapterQuestion } from './store.ts';
import { entryKind } from './catalog.ts';
import { perfectScore,questionWords } from './encounters.ts';
import { adjustStrength,encounterPoints,strengthFor,type Evidence } from './strength.ts';
import { storyDifficulty } from './story-difficulty.ts';

export function focusItems(story:Story){
  const preview=story.preview;
  const targets=new Set([...(preview?.words??[]),...(preview?.review??[]),...(preview?.characters??[])].map(item=>item.text));
  if(preview?.compound)targets.add(preview.compound.text);
  for(const char of preview?.reviewCharacters??[])targets.add(char);
  return targets;
}

export function questionCharacters(q:ChapterQuestion){
  const words=[...questionWords(q.prompt),...questionWords(q.choices[q.correct])];
  return new Set(words.join('').match(/\p{Script=Han}/gu)??[]);
}

export function storyFocus(story:Story,chapter?:number){
  const assigned=chapter===undefined?undefined:story.chapters[chapter]?.focus;
  const strong=assigned?new Set(assigned):focusItems(story);
  const medium=new Set(story.preview?.wordReview?.map(item=>item.text));
  const soft=new Set<string>();
  for(const chapter of story.chapters)for(const q of chapter.questions??[]){
    if(q.reviewRound){medium.add(q.word);continue;}
    soft.add(q.word);
    for(const char of [...q.characters,...questionCharacters(q)])soft.add(char);
  }
  return (text:string)=>strong.has(text)?'strong':medium.has(text)?'medium':soft.has(text)?'soft':'other';
}

// All writes here share the transaction that accepted the answer, mark or chapter.
// Keep gains separate from losses until the story multiplier is known.
export async function recordStoryPoints(db:LearnerDatabase,id:string,chapter:number,text:string,delta:number,now:number,evidence:Evidence){
  const points=await encounterPoints(db,text,delta,now,evidence);
  if(!points || (await strengthFor(db,'word',text)).score===perfectScore)return;
  await db.prepare(`INSERT INTO pending_story_points(story_id,chapter,text,gain,loss)
    SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM story_completions WHERE story_id=$6)
    ON CONFLICT(account_id,story_id,chapter,text) DO UPDATE SET gain=greatest(pending_story_points.gain,excluded.gain),loss=pending_story_points.loss+excluded.loss`)
    .run(id,chapter,text,Math.max(0,points),Math.max(0,-points),id);
}

export async function recordAnswer(db:LearnerDatabase,story:Story,chapter:number,index:number,correct:boolean,english:boolean,now:number){
  const questions=story.chapters[chapter].questions!;
  const q=questions[index];
  const tier=storyFocus(story,chapter);
  const full=storyDifficulty[story.difficulty??'easy'].points;
  const evidence=correct?(english?'assisted':'correct'):'incorrect';
  const tested=new Set([q.word,...q.characters]);
  // Previous answers include any saved under the immediate-award scoring rules.
  const priorCorrect=new Set<string>();
  const prior=db.prepare('SELECT question,choice FROM quiz_attempts WHERE story_id=$1 AND chapter=$2 AND question<>$3 AND english=0 AND choice IS NOT NULL');
  for(const row of await prior.all(story.id,chapter,index)){
    const earlier=questions[Number(row.question)];
    if(row.choice===earlier.correct)for(const text of [earlier.word,...earlier.characters])priorCorrect.add(text);
  }
  for(const text of tested){
    const focus=tier(text);
    const gain=focus==='strong'?full:focus==='medium'?full/2:0.5;
    const delta=correct?(english || priorCorrect.has(text)?0:gain):focus==='soft'?0:-1;
    await recordStoryPoints(db,story.id,chapter,text,delta,now,evidence);
  }
}

export function storyMultiplier(total:number,incorrect:number){
  if(!total)return 1;
  if(!incorrect)return 1.2;
  const correct=(total-incorrect)*100;
  if(correct>=90*total)return 1;
  if(correct>=75*total)return 0.7;
  if(correct>=50*total)return 0.4;
  if(correct>=30*total)return 0.2;
  return -0.5;
}
const rounded=(n:number)=>Math.round(n*1000)/1000;

export async function awardStory(db:LearnerDatabase,story:Story,now:number){
  const answers=await db.prepare('SELECT chapter,question,choice FROM quiz_attempts WHERE story_id=$1 AND choice IS NOT NULL').all(story.id);
  const incorrect=answers.filter(row=>story.chapters[Number(row.chapter)].questions![Number(row.question)].correct!==row.choice).length;
  const multiplier=storyMultiplier(answers.length,incorrect);
  let base=0,penalties=0,awarded=0;
  const rows=await db.prepare('SELECT text,sum(gain) AS gain,sum(loss) AS loss FROM pending_story_points WHERE story_id=$1 GROUP BY text').all(story.id);
  for(const row of rows){
    const text=String(row.text),kind=entryKind('word',text);
    const before=(await strengthFor(db,kind,text)).score??0;
    const gain=Number(row.gain),loss=Number(row.loss);
    base+=gain;penalties+=loss;
    const delta=rounded(gain*multiplier-loss);
    if(!delta || before===perfectScore)continue;
    const after=(await adjustStrength(db,kind,text,delta,now)).score!;
    const actual=rounded(after-before);
    awarded+=actual;
    if(kind==='character' && actual)await db.prepare(`INSERT INTO story_character_points(story_id,character,points) VALUES($1,$2,$3)
      ON CONFLICT(account_id,story_id,character) DO UPDATE SET points=round(story_character_points.points+excluded.points,3)`).run(story.id,text,actual);
  }
  await db.prepare('INSERT INTO story_awards(story_id,incorrect,multiplier,base,penalties,awarded) VALUES($1,$2,$3,$4,$5,$6)').run(story.id,incorrect,multiplier,base,penalties,rounded(awarded));
  await db.prepare('DELETE FROM pending_story_points WHERE story_id=$1').run(story.id);
}
