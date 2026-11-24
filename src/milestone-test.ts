import {randomUUID,randomInt} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {catalog} from './catalog.ts';
import {HttpError} from './store.ts';
import {generateText} from './provider.ts';
import {milestoneProgress} from './milestone-progress.ts';
import {milestoneExercises,checkExercise,type Exercise} from './practice-exercises.ts';

type Line={text:string;pinyin:string};
type Question={prompt:Line;choices:Line[];correct:number;explanation:string};
type Section={title:string;kind:string;lines:Line[];questions:Question[];exercises:Exercise[]};
type Submitted={section:number;task:number;answers:number[]};
const kinds=['Book','Article','Dialogue'];
const nonempty=(value:unknown):value is string=>typeof value==='string'&&!!value.trim();
const line=(value:Line)=>value&&nonempty(value.text)&&nonempty(value.pinyin);

async function generateSections(level:number,generate:typeof generateText){
  const words=catalog.list('word',level);
  const targets=new Set<string>();
  while(targets.size<18)targets.add(words[randomInt(words.length)].text);
  const focus=[...targets];
  const plan=Array.from({length:9},(_,i)=>({kind:kinds[i%3],targets:focus.slice(i*2,i*2+2)}));
  const raw=await generate(`Write nine fresh, independent Mandarin reading passages for an HSK ${level} milestone test.
  Follow this ordered plan: ${JSON.stringify(plan)}. Use simple natural vocabulary through HSK ${level}.
  For each Book write a short narrative, each Article a real-world document, each Dialogue a conversation with speakers.
  Include both assigned words verbatim in the passage and test comprehension of each in context with one Chinese question.
  Return a JSON array. Each entry is {"title":"short Chinese title","lines":[{"text":"Chinese sentence or speaker turn","pinyin":"tone-marked pinyin"}],
  "questions":[{"prompt":{"text":"Chinese","pinyin":"..."},"choices":[{"text":"Chinese","pinyin":"..."}],"correct":0,"explanation":"English explanation using the passage"}]}.
  Supply two questions per passage, each with four distinct plausible choices and a zero-based correct index. No English in passages or choices.`);
  const readings=JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,'')) as Section[];
  if(!Array.isArray(readings)||readings.length!==9)throw Error('The generated test was incomplete. Generate it again.');
  const exercises=milestoneExercises(level);
  const sections:Section[]=[];
  readings.forEach((r,i)=>{
    if(!r||!nonempty(r.title)||!Array.isArray(r.lines)||!r.lines.length||!r.lines.every(line)||
      !plan[i].targets.every(word=>r.lines.some(l=>l.text.includes(word)))||
      !Array.isArray(r.questions)||r.questions.length!==2||!r.questions.every(q=>q&&line(q.prompt)&&
        Array.isArray(q.choices)&&q.choices.length===4&&q.choices.every(line)&&new Set(q.choices.map(c=>c.text)).size===4&&
        Number.isInteger(q.correct)&&q.correct>=0&&q.correct<4&&nonempty(q.explanation)))
      throw Error('A generated passage or question was incomplete. Generate the test again.');
    sections.push({title:r.title,kind:plan[i].kind,lines:r.lines,questions:r.questions,exercises:[]});
    if(i%3!==2)sections.push({title:'Word practice',kind:'Practice',lines:[],questions:[],
      exercises:exercises.splice(0,sections.filter(s=>s.kind==='Practice').length<4?2:1)});
  });
  return sections;
}

const pending=new WeakMap<DatabaseSync,Promise<string>>();
export async function generateTest(db:DatabaseSync,level:number,generate=generateText){
  if(!Number.isInteger(level)||level<1||level>6)throw new HttpError(400,'Choose an HSK level from 1 to 6.');
  const progress=milestoneProgress(db);
  if(progress.milestone!==level||progress.missing.length)throw new HttpError(409,'Complete the milestone requirements first.');
  if(progress.attempt&&progress.attempt.status!=='failed')return String(progress.attempt.id);
  const running=pending.get(db);
  if(running)return running;
  const work=generateSections(level,generate).then(sections=>{
    const id=randomUUID();
    db.prepare("INSERT OR IGNORE INTO milestone_tests(id,level,status,sections) VALUES(?,?,'ready',?)").run(id,level,JSON.stringify(sections));
    return String(db.prepare("SELECT id FROM milestone_tests WHERE level=? AND status!='failed'").get(level)!.id);
  });
  pending.set(db,work);
  try{return await work;}finally{pending.delete(db);}
}

function load(db:DatabaseSync,id:string){
  const row=db.prepare('SELECT * FROM milestone_tests WHERE id=?').get(id);
  if(!row)throw new HttpError(404,'Milestone test not found.');
  return {id,level:Number(row.level),status:String(row.status),mistakes:Number(row.mistakes),
    sections:JSON.parse(String(row.sections)) as Section[],answers:JSON.parse(String(row.answers)) as Submitted[]};
}
function tasks(sections:Section[]){
  return sections.flatMap((s,section)=>Array.from({length:s.questions.length+s.exercises.length},(_,task)=>({section,task})));
}
function feedback(s:Section,task:number,answers:number[]){
  if(s.exercises.length)return checkExercise(s.exercises[task],answers).map(result=>({...result,explanation:result.text+' means '+result.meaning+'.'}));
  const q=s.questions[task];
  if(!Array.isArray(answers)||answers.length!==1||!Number.isInteger(answers[0])||!q.choices[answers[0]])
    throw new HttpError(400,'Choose one answer.');
  return [{text:q.prompt.text,chosen:q.choices[answers[0]].text,meaning:q.choices[q.correct].text,correct:answers[0]===q.correct,explanation:q.explanation}];
}
export function testView(db:DatabaseSync,id:string){
  const a=load(db,id);
  const view={id,level:a.level,status:a.status,mistakes:a.mistakes,index:a.answers.length,
    outline:a.sections.map(({kind,title,questions,exercises})=>({kind,title,count:questions.length+exercises.length}))};
  if(a.status==='ready')return view;
  if(a.status!=='active')return {...view,review:a.answers.flatMap(({section,task,answers})=>
    feedback(a.sections[section],task,answers).map(result=>({...result,section})))};
  const {section,task}=tasks(a.sections)[a.answers.length];
  const s=a.sections[section],q=s.questions[task],e=s.exercises[task];
  return {...view,section,task,lines:s.lines,question:q?{prompt:q.prompt,choices:q.choices}:null,
    exercise:e?{type:e.type,targets:e.targets.map(({text,pinyin})=>({text,pinyin})),options:e.options}:null};
}
export function startTest(db:DatabaseSync,id:string){
  db.prepare("UPDATE milestone_tests SET status='active' WHERE id=? AND status='ready'").run(id);
  return testView(db,id);
}
export function submitTest(db:DatabaseSync,id:string,index:number,answers:number[]){
  db.exec('BEGIN IMMEDIATE');
  try{
    const a=load(db,id);
    const sequence=tasks(a.sections);
    if(index===a.answers.length&&a.status==='active'){
      const {section,task}=sequence[index];
      const mistakes=a.mistakes+feedback(a.sections[section],task,answers).filter(item=>!item.correct).length;
      a.answers.push({section,task,answers});
      const status=mistakes>3?'failed':a.answers.length===sequence.length?'passed':'active';
      db.prepare('UPDATE milestone_tests SET status=?,mistakes=?,answers=? WHERE id=?').run(status,mistakes,JSON.stringify(a.answers),id);
    }else if(!Number.isInteger(index)||!a.answers[index]||JSON.stringify(a.answers[index].answers)!==JSON.stringify(answers)){
      throw new HttpError(409,'Reopen the current test question.');
    }
    const view=testView(db,id);
    db.exec('COMMIT');
    return view;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
