import {HttpError,type ReadingStore} from './store.ts';
import {completionFor} from './completion.ts';
import {actionParagraph,ensureActions,sentenceText} from './word-actions.ts';
import {focusItems} from './story-scoring.ts';
import {catalog} from './catalog.ts';
import {storyDifficulty} from './story-difficulty.ts';

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
    const paragraph=actionParagraph(story,Number(record.chapter),Number(record.paragraph))!;
    groups.get(word)!.add(sentenceText(paragraph,Number(record.token)));
  }
  const words=new Set(story.chapters.flatMap(chapter=>chapter.paragraphs.flat())
    .filter(token=>!token.cast && /\p{Script=Han}/u.test(token.text)).map(token=>token.text));
  const row=store.db.prepare('SELECT rating FROM story_ratings WHERE story_id=?').get(id);
  const attempts=store.db.prepare('SELECT chapter,question,choice FROM quiz_attempts WHERE story_id=? AND choice IS NOT NULL').all(id);
  const reviews=attempts.filter(a=>story.chapters[Number(a.chapter)].questions?.[Number(a.question)].reviewRound);
  const comprehension=attempts.filter(a=>!story.chapters[Number(a.chapter)].questions?.[Number(a.question)].reviewRound);
  const reviewCorrect=reviews.filter(a=>story.chapters[Number(a.chapter)].questions![Number(a.question)].correct===a.choice).length;
  const correct=comprehension.filter(a=>story.chapters[Number(a.chapter)].questions?.[Number(a.question)].correct===a.choice).length;
  const targets=focusItems(story);
  const gains=store.db.prepare('SELECT character,points FROM story_character_points WHERE story_id=? AND points>0 ORDER BY points DESC,character')
    .all(id).map(row=>({text:String(row.character),points:Number(row.points)}))
    .sort((a,b)=>Number(targets.has(b.text))-Number(targets.has(a.text)));
  const characters=gains.map(item=>({...item,focus:targets.has(item.text),
    pinyin:catalog.get('character',item.text)?.senses[0]?.pinyin}));
  const award=store.db.prepare('SELECT incorrect,multiplier,base,penalties,awarded FROM story_awards WHERE story_id=?').get(id);
  const difficulty=story.difficulty??'easy';
  const focusPoints=storyDifficulty[difficulty].points;
  return {award,difficulty,focusPoints,focusRate:focusPoints/storyDifficulty.medium.points,
    title:story.title,chapters:story.chapters.length,distinctWords:words.size,rating:row?.rating??null,
    characterGains:{highlights:characters.slice(0,5),others:characters.slice(5),otherCount:Math.max(0,characters.length-5)},
    ...(comprehension.length?{quiz:{correct,total:comprehension.length}}:{}),
    ...(reviews.length?{wordReview:{correct:reviewCorrect,total:reviews.length}}:{}),
    marked:[...groups].map(([text,sentences])=>({text,sentences:[...sentences]}))};
}
