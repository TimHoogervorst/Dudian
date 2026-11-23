import type {DatabaseSync} from 'node:sqlite';
import {catalog} from './catalog.ts';
import {ReadingStore,HttpError,type Token} from './store.ts';
import {adjustStrength} from './strength.ts';

// Authored senses for the bundled chapter, including copies already saved by earlier versions.
const teaSenses: Record<string,string> = {
  今天:'4df075e22a7e4cbb',下午:'bd60c3f80086e1a5',我:'350bfd651845a649',和:'96723babf40888b6',
  朋友:'2a66f321946986b7',去:'5e100133697198bf',喝:'cb94c4ab9b0db262',茶:'d423c3186aee9d3c',
  她:'101344d44bc856d3',问:'11c608013904bfe3',你:'11949d02379b509f',想:'b13e04d8144d766e',
  什么:'beabf219c476c95f',说:'e396111bfae64ee0',一:'1571c09934b19923',杯:'a2fd71b046ab1629',
  好:'acf5ad5a07ff6e8d',这:'83b4ee9ea914942e',是:'35e09f4d22dbd853',的:'d09e6bc994e966fd',
  很:'7a2e9b0d37444d0d',热:'91bd1f3786a1b881',外面:'d2bdafd26a559983',下雨:'8e0db64139667d3c',
  了:'e290b842caa46f45',我们:'55c5dd8b5d75f69a',坐:'dcfa19cda7aefae6',在:'165cd1cc5c39be62',
  这里:'c130517133db07d9',看:'c0ce7d192746ebfe',雨:'ce4db149fe2741b7',明天:'ffe87c9653c8384e',
  来:'9d0fc32ac1dfd1bc',吗:'04944f2f0d92c0f9',再见:'2c2d61f3c7d913f2',
};
export function ensureActions(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS word_actions(
    id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id),
    chapter INTEGER NOT NULL, paragraph INTEGER NOT NULL, token INTEGER NOT NULL,
    word TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('lookup','difficulty')), at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS word_actions_chapter ON word_actions(story_id,chapter,kind,word);
  CREATE TABLE IF NOT EXISTS reader_preferences(id INTEGER PRIMARY KEY,pinyin INTEGER NOT NULL);
  INSERT OR IGNORE INTO reader_preferences VALUES(1,0);`);
}

export interface WordAction {storyId:string;chapter:number;paragraph:number;token:number;id:string;kind:'lookup'|'difficulty'}
export function sentenceText(tokens:Token[],index:number) {
  const sentence=tokens[index].sentence;
  return tokens.filter(t=>t.sentence===sentence).map(t=>t.text).join('');
}
export function recordAction(store:ReadingStore, action:WordAction, now=Date.now()) {
  const {db}=store;
  if (!action || !['difficulty','lookup'].includes(action.kind) || typeof action.id!=='string' || !action.id.length || action.id.length>100 ||
      typeof action.storyId!=='string' || ![action.chapter,action.paragraph,action.token].every(Number.isInteger)) {
    throw new HttpError(400,'Select a word in this chapter.');
  }
  const story=store.story(action.storyId);
  const occurrence=story.chapters[action.chapter]?.paragraphs[action.paragraph]?.[action.token];
  if (!occurrence || !/\p{Script=Han}/u.test(occurrence.text)) throw new HttpError(400,'Select a Chinese word.');
  const {text}=occurrence;
  const sense=occurrence.sense ?? (story.id==='tea-shop' ? teaSenses[text] : undefined);
  const item=catalog.get('word',occurrence.entry??text);
  const selected=item?.senses.find(candidate=>candidate.id===sense);
  if (!selected) throw new HttpError(422,'The dictionary sense for this word is unavailable.');
  ensureActions(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const result=db.prepare('INSERT OR IGNORE INTO word_actions VALUES(?,?,?,?,?,?,?,?)')
      .run(action.id,story.id,action.chapter,action.paragraph,action.token,text,action.kind,now);
    if (result.changes && action.kind==='difficulty') adjustStrength(db,'word',text,-3);
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  return {text,sense:selected.id,pinyin:selected.pinyin,meaning:selected.meaning};
}

export function usageHistory(store:ReadingStore,char:string) {
  ensureActions(store.db);
  return store.db.prepare(`SELECT * FROM word_actions WHERE kind='difficulty' AND instr(word,?)>0
    ORDER BY at DESC`).all(char).map(row=>{
    const story=store.story(String(row.story_id));
    const tokens=story.chapters[Number(row.chapter)].paragraphs[Number(row.paragraph)];
    return {word:String(row.word),at:Number(row.at),storyId:story.id,title:story.title,chapter:Number(row.chapter),sentence:sentenceText(tokens,Number(row.token))};
  });
}

