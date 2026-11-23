import { randomUUID } from 'node:crypto';
import { catalog } from './catalog.ts';
import { type ReadingStore, type Story, type Token } from './store.ts';
import { type StoryPlan } from './story-plan.ts';
import { generateText } from './provider.ts';

export type CandidateWriter = (prompt:string) => Promise<string>;
type Chapter = Story['chapters'][number];

export class CandidateError extends Error {
  chapter?:number;
  constructor(message:string, chapter?:number) {
    super(message);
    this.chapter = chapter;
  }
}

function lexicon(plan:StoryPlan) {
  const words = [...plan.background,...plan.newWords,...plan.reviewWords];
  if (plan.compound) words.push(plan.compound);
  const dictionary = new Map<string,NonNullable<ReturnType<typeof catalog.get>>['senses']>();
  for (const word of new Set(words)) {
    const entry = catalog.get('word',word);
    if (entry) dictionary.set(word,entry.senses.slice(0,8));
  }
  return dictionary;
}
type Lexicon = ReturnType<typeof lexicon>;

function promptFor(plan:StoryPlan,dictionary:Lexicon) {
  const glossary = [...dictionary].map(([word,senses]) =>
    word+' '+senses.map((s,i) => String(i+1)+'='+s.meaning).join(' | ')).join('\n');
  return [
    'Write one coherent, engaging slice-of-life story for a learner of simplified Mandarin. Titles are short and in English.',
    'Return only a JSON object with title and chapters. Each chapter has title and paragraphs. Each paragraph is an array of sentences. Each sentence is an ordered array of strings.',
    'Each word token must be exactly FORM:NUMBER, using the glossary number for its contextual meaning. Send punctuation as separate strings. Example sentence ["我:1","喝:1","茶:1","。"].',
    'Use only listed forms, including for names, numbers, and particles. Segment at natural word boundaries.',
    'Write '+plan.chapterCount+' chapter(s) totaling approximately '+plan.targetWords+' word occurrences. Use multiple paragraphs for each chapter.',
    'Use each teaching word at least once: '+[...plan.newWords,...(plan.compound?[plan.compound]:[])].join('、'),
    'Reuse each review word in at least two distinct sentences: '+plan.reviewWords.join('、'),
    'Allowed glossary with per-word sense numbers:',glossary
  ].join('\n');
}

function title(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180;
}
function tokenFor(raw:unknown,dictionary:Lexicon,sentence:number,chapter:number): Token {
  if (typeof raw === 'string' && /^[，。！？、；：“”‘’（）…—《》,.!?:;]+$/u.test(raw)) return {text:raw,sentence};
  const match = typeof raw === 'string' ? /^([^:\s]+):([1-9]\d*)$/u.exec(raw) : null;
  const sense = match && dictionary.get(match[1])?.[Number(match[2])-1];
  if (!match || !sense) throw new CandidateError('Chapter '+(chapter+1)+' contains an unlisted form or sense: '+String(raw).slice(0,60),chapter);
  return {text:match[1],entry:match[1],sense:sense.id,pinyin:sense.pinyin,meaning:sense.meaning,sentence};
}
function list(input:unknown): input is unknown[] { return Array.isArray(input) && input.length>0; }
function chapterFrom(raw:any,index:number,dictionary:Lexicon): Chapter {
  const fail = () => new CandidateError('Chapter '+(index+1)+' needs a title and nonempty paragraphs of segmented sentences.',index);
  if (!raw || !title(raw.title) || !list(raw.paragraphs)) throw fail();
  const paragraphs: Token[][] = raw.paragraphs.map((para:unknown) => {
    if (!list(para)) throw fail();
    return para.flatMap((sentence,i) => {
      if (!list(sentence)) throw fail();
      const tokens = sentence.map(value => tokenFor(value,dictionary,i,index));
      if (!tokens.some(token => token.entry)) throw fail();
      return tokens;
    });
  });
  return {title:raw.title.trim(),paragraphs};
}
function validate(candidate:any, plan:StoryPlan, dictionary:Lexicon) {
  if (!candidate || !title(candidate.title) || !Array.isArray(candidate.chapters) || candidate.chapters.length !== plan.chapterCount) {
    throw new CandidateError('Expected a title and exactly '+plan.chapterCount+' chapters.');
  }
  const chapters:Chapter[] = candidate.chapters.map((raw:unknown,i:number) => chapterFrom(raw,i,dictionary));
  const sentencesByWord = new Map<string,Set<string>>();
  let count = 0;
  chapters.forEach((chapter,c) => chapter.paragraphs.forEach((tokens,p) => tokens.forEach(token => {
    if (!token.entry) return;
    count++;
    if (!sentencesByWord.has(token.text)) sentencesByWord.set(token.text,new Set());
    sentencesByWord.get(token.text)!.add([c,p,token.sentence].join('/'));
  })));
  const words = [...sentencesByWord.keys()];
  for (const char of plan.newCharacters) {
    if (!words.some(word => word.includes(char))) throw new CandidateError('Missing target character '+char,0);
  }
  for (const word of [...plan.newWords,...(plan.compound?[plan.compound]:[])]) {
    if (!sentencesByWord.has(word)) throw new CandidateError('Missing teaching word '+word,0);
  }
  for (const word of plan.reviewWords) {
    if ((sentencesByWord.get(word)?.size ?? 0)<2) throw new CandidateError('Use '+word+' in two separate sentences.',0);
  }
  const backgroundCharacters = new Set(plan.background.join(''));
  const novel = new Set(plan.newCharacters);
  for (const char of words.join('')) if (!backgroundCharacters.has(char)) novel.add(char);
  if (novel.size>plan.ceiling) throw new CandidateError('The story exceeds the new-character ceiling.');
  if (count < Math.floor(plan.targetWords*0.6) || count > Math.ceil(plan.targetWords*1.5)) {
    throw new CandidateError('The story contains '+count+' words; aim for '+plan.targetWords+'.');
  }
  return {title:candidate.title.trim() as string,chapters};
}

function previewFor(plan:StoryPlan,chapters:Chapter[]) {
  const words = chapters.flatMap(chapter => chapter.paragraphs.flat()).filter(token => token.entry);
  function wordPreview(text:string) {
    const occurrence = words.find(word=>word.text===text)!;
    return {text,pinyin:occurrence.pinyin,meaning:occurrence.meaning};
  }
  const characters = plan.newCharacters.map(text=>{
    const example = plan.newWords.find(word=>word.includes(text)) ?? words.find(word=>word.text.includes(text))!.text;
    const occurrence = words.find(word=>word.text===example)!;
    const char = catalog.get('character',text);
    const word = catalog.get('word',example,String(occurrence.sense));
    const reading = word?.components.find(part=>part.text===text)?.pinyin;
    const sense = char?.senses.find(sense=>sense.pinyin===reading) ?? char?.senses[0];
    return {text,example,pinyin:reading ?? sense?.pinyin,meaning:text===example ? occurrence.meaning : sense?.meaning};
  });
  return {characters,compound:plan.compound?wordPreview(plan.compound):undefined,review:plan.reviewWords.map(wordPreview)};
}
export async function generateStory(store:ReadingStore,plan:StoryPlan,write:CandidateWriter=generateText) {
  const dictionary = lexicon(plan);
  const raw = await write(promptFor(plan,dictionary));
  let candidate;
  try { candidate = JSON.parse(raw); }
  catch { throw new CandidateError('The story response contained invalid JSON. Please retry.'); }
  const accepted = validate(candidate,plan,dictionary);
  const story = {id:randomUUID(),...accepted,preview:previewFor(plan,accepted.chapters)};
  store.saveStory(story);
  return story;
}
