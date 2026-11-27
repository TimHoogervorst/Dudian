import { randomUUID,randomInt } from 'node:crypto';
import type { LearnerDatabase } from './postgres/learner-database.ts';
import { catalog } from './catalog.ts';
import { HttpError } from './store.ts';
import { generateText } from './provider.ts';
import { milestoneProgress } from './milestone-progress.ts';
import { exerciseView,planMilestoneWordPractice,type Exercise } from './practice-exercises.ts';

import { generateReading } from './story-generation.ts';
import { readingSize } from './story-plan.ts';
import { articleDocuments,milestones,readingOptions,type ReadingFormat } from './reading-types.ts';
import { dictionaryTokens } from './cover-text.ts';
import type { QuizText,Token } from './store.ts';

type Word=Pick<Token,'text'|'pinyin'>;
type Line=Word & {tokens?:Word[]};
type Question={prompt:Line;choices:Line[];correct:number};
type Section={title:string;kind:string;lines:Line[];questions:Question[];exercises:Exercise[];
  names?:string[];speakers?:number[];sections?:string[]};
type Submitted={section:number;task:number;answers:number[]};

function readingLine(tokens:Word[]):Line{
  return {text:tokens.map(t=>t.text).join(''),tokens:tokens.map(({text,pinyin})=>({text,pinyin}))};
}

function sample(words:string[],count:number){
  const pool=[...words];
  return Array.from({length:Math.min(count,pool.length)},()=>pool.splice(randomInt(pool.length),1)[0]);
}

const passageKinds=['Book','Dialogue','Article','Book','Dialogue'] as const;

async function generateSections(level:number,generate:typeof generateText,report:(completed:number)=>void){
  const targets=sample(catalog.list('word',level).map(w=>w.text),passageKinds.length*2);
  // Keep common function words available and the sense-numbered glossary within a single chapter prompt.
  const background=catalog.list('word',1).map(w=>w.text);
  for(let band=2;band<=level;band++)background.push(...sample(catalog.list('word',band).map(w=>w.text),40));
  const strongCharacters=new Set(catalog.list('character').filter(c=>c.level<=level).map(c=>c.text)).size;
  const formatLevel=Math.max(...Object.values(milestones).flat().map(([,threshold])=>threshold).filter(n=>n<level));
  const sections:Section[]=[];
  const nextWordPractice=planMilestoneWordPractice(level);
  for(const [i,kind] of passageKinds.entries()){
    const {stage,people}=readingOptions(formatLevel);
    const format:ReadingFormat=kind==='Book'?{type:'book',stage}:kind==='Dialogue'?{type:'dialogue',people}:
      {type:'article',documents:articleDocuments(formatLevel,1)};
    const focus=targets.slice(i*2,i*2+2);
    const plan={...readingSize('hard',1),format,hskLimit:level,background:[...new Set([...background,...focus])],newWords:focus,
      strongCharacters,newCharacters:[],reviewWords:[],ceiling:0};
    const story=await generateReading(plan,generate,[],undefined,focus);
    const chapter=story.chapters[0];
    const display=(part:QuizText)=>readingLine(dictionaryTokens(story,part.zh,part.words));
    sections.push({title:chapter.title,kind,lines:chapter.paragraphs.map(readingLine),
      names:chapter.names,speakers:chapter.speakers,sections:chapter.sections,
      questions:chapter.questions!.map(q=>({prompt:display(q.prompt),choices:q.choices.map(display),correct:q.correct})),exercises:[]});
    sections.push({title:'Word practice',kind:'Practice',lines:[],questions:[],
      exercises:nextWordPractice()});
    report(i+1);
  }
  return sections;
}

function displayLine(line:Line){
  // Earlier attempts stored a sentence-wide pronunciation. Recover ordinary reader word boundaries.
  if(line.tokens)return line;
  const words=dictionaryTokens({chapters:[]},line.text);
  // Preserve the original tones (including neutral particles) when the saved
  // pronunciation aligns with the recovered words, even if its spacing differs.
  const letters=(s:string)=>s.normalize('NFC').match(/\p{L}/gu)??[];
  const base=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const original=letters(line.pinyin??'');
  const readings=words.map(w=>letters(w.pinyin??'').join(''));
  if(base(readings.join(''))===base(original.join(''))){
    let offset=0;
    words.forEach((w,i)=>{
      const end=offset+readings[i].length;
      if(end>offset)w.pinyin=original.slice(offset,end).join('');
      offset=end;
    });
  }
  return readingLine(words);
}

type PreparationJob={completed:number;work:Promise<string>};
const jobs=new WeakMap<LearnerDatabase,Map<number,PreparationJob>>();
const failures=new WeakMap<LearnerDatabase,Set<number>>();
async function active(db:LearnerDatabase,level:number){
  return await db.prepare("SELECT id,status FROM milestone_tests WHERE level=$1 AND status IN ('ready','active')").get(level);
}
export async function generateTest(db:LearnerDatabase,level:number,generate=generateText){
  if(!Number.isInteger(level)||level<1||level>6)throw new HttpError(400,'Choose an HSK level from 1 to 6.');
  const progress=await milestoneProgress(db);
  if(level>progress.passed&&progress.milestone!==level)throw new HttpError(409,'Complete the milestone requirements first.');
  const current=await active(db,level);
  if(current)return String(current.id);
  const pending=jobs.get(db)??new Map<number,PreparationJob>();
  jobs.set(db,pending);
  const running=pending.get(level);
  if(running)return running.work;
  const failed=failures.get(db)??new Set<number>();
  failures.set(db,failed);
  failed.delete(level);
  const work=generateSections(level,generate,completed=>{job.completed=completed;}).then(async sections=>{
    await db.prepare("INSERT INTO milestone_tests(id,level,status,sections) VALUES($1,$2,'ready',$3) ON CONFLICT DO NOTHING").run(randomUUID(),level,JSON.stringify(sections));
    return String((await active(db,level))!.id);
  }).catch(error=>{failed.add(level);throw error;}).finally(()=>pending.delete(level));
  const job:PreparationJob={completed:0,work};
  pending.set(level,job);
  return work;
}
export async function prepareMilestones(db:LearnerDatabase,generate=generateText){
  const progress=await milestoneProgress(db);
  const levels=Array.from({length:progress.passed},(_,i)=>i+1);
  if(progress.milestone)levels.push(progress.milestone);
  for(const level of levels){
    if(!await active(db,level)&&!jobs.get(db)?.has(level)&&!failures.get(db)?.has(level))void generateTest(db,level,generate).catch(()=>{});
  }
}
export async function preparation(db:LearnerDatabase,level:number){
  const job=jobs.get(db)?.get(level);
  return {completed:job?.completed??0,total:passageKinds.length,attempt:await active(db,level),failed:failures.get(db)?.has(level)??false};
}
async function load(db:LearnerDatabase,id:string){
  const row=await db.prepare('SELECT * FROM milestone_tests WHERE id=$1').get(id);
  if(!row)throw new HttpError(404,'Milestone test not found.');
  return {id,level:Number(row.level),status:String(row.status),position:Number(row.position),
    sections:JSON.parse(String(row.sections)) as Section[],answers:JSON.parse(String(row.answers)) as Submitted[]};
}
function items(section:Section,task:number){
  const q=section.questions[task];
  if(q)return [{text:q.prompt.text,options:q.choices.map(c=>c.text),meaning:q.choices[q.correct].text}];
  const e=section.exercises[task];
  return e.targets.map(t=>({text:t.text,options:e.options,meaning:t.meaning}));
}
function grade(a:Awaited<ReturnType<typeof load>>){
  const review=a.sections.flatMap((s,section)=>Array.from({length:s.questions.length+s.exercises.length},(_,task)=>{
    const draft=a.answers.find(d=>d.section===section&&d.task===task);
    return items(s,task).flatMap(({text,options,meaning},i)=>{
      const chosen=options[draft?.answers[i]??-1]??null;
      return chosen===meaning?[]:[{section,task,text,chosen,meaning}];
    });
  }).flat());
  const reading={mistakes:0,unanswered:0},practice={mistakes:0,unanswered:0};
  for(const item of review){
    const counts=a.sections[item.section].questions.length?reading:practice;
    if(item.chosen===null)counts.unanswered++;
    else counts.mistakes++;
  }
  return {review,reading,practice,unanswered:reading.unanswered+practice.unanswered,mistakes:reading.mistakes+practice.mistakes};
}
export async function testView(db:LearnerDatabase,id:string){
  const a=await load(db,id);
  const view={id,level:a.level,status:a.status,position:a.position,answers:a.answers,
    practiceRetake:a.status==='active'&&!!await db.prepare('SELECT 1 FROM milestone_passes WHERE level=$1').get(a.level),
    sections:await Promise.all(a.sections.map(async s=>({kind:s.kind,title:s.title,lines:s.lines.map(displayLine),names:s.names,speakers:s.speakers,sections:s.sections,
      tasks:[...s.questions.map(q=>({prompt:displayLine(q.prompt),targets:[],options:q.choices.map(displayLine)})),
        ...await Promise.all(s.exercises.map(async e=>({prompt:null,...await exerciseView(db,e,a.level)})))]})))};
  if(a.status==='failed'||a.status==='passed')return {...view,...grade(a)};
  return view;
}
export async function startTest(db:LearnerDatabase,id:string){
  await db.prepare("UPDATE milestone_tests SET status='active',position=-1 WHERE id=$1 AND status='ready'").run(id);
  return await testView(db,id);
}
export async function saveDraft(db:LearnerDatabase,id:string,section:number,task?:number,answers?:number[]){
  return db.transaction(async()=>{
    const a=await load(db,id);
    if(a.status!=='active')throw new HttpError(409,'This test is closed.');
    if(!Number.isInteger(section)||section< -1||section>a.sections.length)throw new HttpError(400,'Unknown section.');
    if(task!==undefined){
      const s=a.sections[section];
      if(!s||!Number.isInteger(task)||task<0||task>=s.questions.length+s.exercises.length)throw new HttpError(400,'Unknown question.');
      const rows=items(s,task);
      if(!Array.isArray(answers)||answers.length!==rows.length||answers.some((v,i)=>!Number.isInteger(v)||v< -1||v>=rows[i].options.length))
        throw new HttpError(400,'Invalid answer.');
      const filled=answers.filter(v=>v>=0);
      if(new Set(filled).size!==filled.length)throw new HttpError(400,'Choose a distinct meaning for each word.');
      a.answers=a.answers.filter(d=>d.section!==section||d.task!==task);
      a.answers.push({section,task,answers});
      if(filled.length)await db.prepare('UPDATE score_tracking SET last_milestone_practice=$1 WHERE id=1').run(Date.now());
    }
    await db.prepare('UPDATE milestone_tests SET position=$1,answers=$2 WHERE id=$3').run(section,JSON.stringify(a.answers),id);
  });
}
export async function submitTest(db:LearnerDatabase,id:string){
  return db.transaction(async()=>{
    const a=await load(db,id);
    if(a.status==='ready')throw new HttpError(409,'Start this test first.');
    if(a.status==='active'){
      const {reading,practice,mistakes,unanswered}=grade(a);
      const passed=unanswered===0&&reading.mistakes<=3&&practice.mistakes<=3;
      await db.prepare('UPDATE milestone_tests SET status=$1,mistakes=$2 WHERE id=$3').run(passed?'passed':'failed',mistakes,id);
    }
    return await testView(db,id);
  });
}
export async function discardTest(db:LearnerDatabase,id:string){
  await db.prepare('DELETE FROM milestone_tests WHERE id=$1').run(id);
}
