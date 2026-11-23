import type {DatabaseSync} from 'node:sqlite';
import {readSession} from './flashcards.ts';
import {generateText} from './provider.ts';
import {HttpError,type Story} from './store.ts';

export async function flashcardExample(db:DatabaseSync,id:string,index:number,write=generateText){
  const session=readSession(db,id);
  if(!session.card||index!==session.index)throw new HttpError(409,'Reopen the current flashcard.');
  const {kind,text}=session.card;
  const stories=db.prepare(`SELECT content FROM stories WHERE instr(content,?)>0
    AND id NOT IN (SELECT story_id FROM hidden_stories) ORDER BY created_at DESC`).iterate(text);
  for(const row of stories){
    const story:Story=JSON.parse(String(row.content));
    for(const chapter of story.chapters)for(const paragraph of chapter.paragraphs){
      const i=paragraph.findIndex(t=>!t.cast&&(kind==='word'?t.text===text:t.text.includes(text)));
      if(i<0)continue;
      const sentence=paragraph.filter(t=>t.sentence===paragraph[i].sentence);
      const match=sentence.indexOf(paragraph[i]);
      const prefix=sentence.slice(0,match).map(t=>t.text).join('');
      const suffix=sentence.slice(match+1).map(t=>t.text).join('');
      const offset=paragraph[i].text.indexOf(text);
      return {before:prefix+paragraph[i].text.slice(0,offset),target:text,after:paragraph[i].text.slice(offset+text.length)+suffix};
    }
  }
  db.exec('CREATE TABLE IF NOT EXISTS flashcard_examples(text TEXT PRIMARY KEY,before_text TEXT NOT NULL,after_text TEXT NOT NULL)');
  const find=db.prepare('SELECT before_text AS before,text AS target,after_text AS after FROM flashcard_examples WHERE text=?');
  const saved=find.get(text);
  if(saved)return saved;
  const raw=await write('Write one short natural simplified Chinese example sentence using '+text+' in context. Use easy everyday surrounding vocabulary. '+
    'Return only a JSON object with strings "before" and "after". The complete sentence is before + "'+text+'" + after. Include final Chinese punctuation. No spaces, pinyin, translation, blanks or explanation.');
  let parts;
  try{parts=JSON.parse(raw);}catch{throw new HttpError(502,'The example was unreadable. Try the hint again.');}
  if(typeof parts?.before!=='string'||typeof parts.after!=='string'||!/^[\p{Script=Han}\p{P}\d]*$/u.test(parts.before+parts.after)||
    !/\p{Script=Han}/u.test(parts.before+parts.after)||parts.before.length+parts.after.length>100||!/[。！？]$/u.test(parts.after)){
    throw new HttpError(502,'A usable Chinese sentence was not returned. Try the hint again.');
  }
  db.prepare('INSERT OR IGNORE INTO flashcard_examples VALUES(?,?,?)').run(text,parts.before,parts.after);
  return find.get(text)!;
}
