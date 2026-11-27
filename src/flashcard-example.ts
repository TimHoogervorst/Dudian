import type { LearnerDatabase } from './postgres/learner-database.ts';
import { readSession } from './flashcards.ts';
import type { ItemKind } from './catalog.ts';
import { HttpError,type Story } from './store.ts';

export async function storedExample(db:LearnerDatabase,kind:ItemKind,text:string,target?:{senseId?:string;pinyin:string;meaning:string}){
  const stories=await db.prepare(`SELECT content FROM stories WHERE strpos(content::text,$1)>0
    AND id NOT IN (SELECT story_id FROM hidden_stories) ORDER BY created_at DESC`).all(text);
  for(const row of stories){
    const story:Story=JSON.parse(String(row.content));
    for(const chapter of story.chapters)for(const paragraph of chapter.paragraphs){
      const i=paragraph.findIndex(t=>{
        if(t.cast)return false;
        if(!target)return kind==='word'?t.text===text:t.text.includes(text);
        if(t.text!==text)return false;
        if(typeof t.sense==='string'&&target.senseId)return t.sense===target.senseId;
        return t.meaning===target.meaning&&t.pinyin?.replaceAll(' ','')===target.pinyin.replaceAll(' ','');
      });
      if(i<0)continue;
      const sentence=paragraph.filter(t=>t.sentence===paragraph[i].sentence);
      const match=sentence.indexOf(paragraph[i]);
      const prefix=sentence.slice(0,match).map(t=>t.text).join('');
      const suffix=sentence.slice(match+1).map(t=>t.text).join('');
      const offset=paragraph[i].text.indexOf(text);
      return {before:prefix+paragraph[i].text.slice(0,offset),target:text,after:paragraph[i].text.slice(offset+text.length)+suffix};
    }
  }
  if(target)return;

  const find=db.prepare('SELECT before_text AS before,text AS target,after_text AS after FROM flashcard_examples WHERE text=$1');
  return (await find.get(text)) as {before:string;target:string;after:string}|undefined;
}

export async function flashcardExample(db:LearnerDatabase,id:string,index:number,write?:(prompt:string)=>Promise<string>){
  const session=await readSession(db,id);
  if(!session.card||index!==session.index)throw new HttpError(409,'Reopen the current flashcard.');
  const {kind,text}=session.card;
  const saved=await storedExample(db,kind,text);
  if(saved)return saved;
  if(!write)throw new HttpError(404,'No saved example for this entry.');
  const raw=await write('Write one short natural simplified Chinese example sentence using '+text+' in context. Use easy everyday surrounding vocabulary. '+
    'Return only a JSON object with strings "before" and "after". The complete sentence is before + "'+text+'" + after. Include final Chinese punctuation. No spaces, pinyin, translation, blanks or explanation.');
  let parts;
  try{parts=JSON.parse(raw);}catch{throw new HttpError(502,'The example was unreadable. Try the hint again.');}
  if(typeof parts?.before!=='string'||typeof parts.after!=='string'||!/^[\p{Script=Han}\p{P}\d]*$/u.test(parts.before+parts.after)||
    !/\p{Script=Han}/u.test(parts.before+parts.after)||parts.before.length+parts.after.length>100||!/[。！？]$/u.test(parts.after)){
    throw new HttpError(502,'A usable Chinese sentence was not returned. Try the hint again.');
  }
  await db.prepare('INSERT INTO flashcard_examples VALUES($1,$2,$3) ON CONFLICT DO NOTHING').run(text,parts.before,parts.after);
  return {before:parts.before,target:text,after:parts.after};
}
