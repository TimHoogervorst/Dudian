import {HttpError,type ReadingStore} from './store.ts';
import {completionFor} from './completion.ts';
import {ensureActions,sentenceText} from './word-actions.ts';

function completed(store:ReadingStore,id:string) {
  const story=store.story(id);
  if(!completionFor(store,id).finished)throw new HttpError(409,'Finish the story to see its summary.');
  store.db.exec(`CREATE TABLE IF NOT EXISTS story_ratings(
    story_id TEXT PRIMARY KEY REFERENCES stories(id),rating TEXT NOT NULL CHECK(rating IN ('up','down')))`);
  return story;
}
export function rateStory(store:ReadingStore,id:string,rating:unknown) {
  if(rating!=='up'&&rating!=='down') throw new HttpError(400,'Choose a thumbs-up or thumbs-down rating.');
  completed(store,id);
  store.db.prepare('INSERT INTO story_ratings VALUES(?,?) ON CONFLICT(story_id) DO UPDATE SET rating=excluded.rating').run(id,rating);
  return {rating};
}
export function storySummary(store:ReadingStore,id:string) {
  const story=completed(store,id);
  ensureActions(store.db);
  const records=store.db.prepare(`SELECT DISTINCT word,chapter,paragraph,token FROM word_actions
    WHERE story_id=? AND kind='difficulty' ORDER BY chapter,paragraph,token`).all(id);
  const groups=new Map<string,Set<string>>();
  for(const record of records) {
    const word=String(record.word);
    if(!groups.has(word))groups.set(word,new Set());
    const paragraph=story.chapters[Number(record.chapter)].paragraphs[Number(record.paragraph)];
    groups.get(word)!.add(sentenceText(paragraph,Number(record.token)));
  }
  const words=new Set(story.chapters.flatMap(chapter=>chapter.paragraphs.flat())
    .filter(token=>/\p{Script=Han}/u.test(token.text)).map(token=>token.text));
  const row=store.db.prepare('SELECT rating FROM story_ratings WHERE story_id=?').get(id);
  return {title:story.title,chapters:story.chapters.length,distinctWords:words.size,rating:row?.rating??null,
    marked:[...groups].map(([text,sentences])=>({text,sentences:[...sentences]}))};
}
