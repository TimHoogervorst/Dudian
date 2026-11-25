import {coverTemplate} from './cover-template.ts';
import {articleSectionsValid,bookWithCast,formatRules} from './reading-format.ts';
import {messages} from './reading-types.ts';
import {planWordReviews,wordReviewCards} from './word-review.ts';
import { randomUUID } from 'node:crypto';
import { catalog } from './catalog.ts';
import { type ReadingStore, type Story, type Token } from './store.ts';
import { chapterFocus, paragraphCounts, type StoryPlan } from './story-plan.ts';
import { generateText } from './provider.ts';
import {generateQuestions} from './quiz-generation.ts';
import {isTranslation} from './paragraph-translation.ts';
import {numberSentences} from './cover-text.ts';

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
    'Write simplified Mandarin for a learner. Titles are short and in English.',formatRules(plan),
    ...(plan.subject?['Focus the reading on the selected subject '+plan.subject.en+' ('+plan.subject.zh+'). Express it using the approved glossary and weave the focus words into the action.']:[]),
    ...(plan.hskLimit?['Use only Chinese characters through HSK '+plan.hskLimit+' everywhere, including speaker names. Choose names using characters in the approved glossary.']:[]),
    'This learner has strong reading knowledge of '+(plan.strongCharacters??0)+' distinct Chinese characters.',
    'Include a teaser property: one or two short spoiler-free Chinese sentences, encoded as a flat array of the same FORM:NUMBER and punctuation tokens.',
    'Return only a JSON object with title, teaser and chapters. Each chapter has title, paragraphs and translations. translations is an array of natural English strings, exactly one full translation per paragraph in matching order. Preserve dialogue, names and meaning without adding explanations. Each paragraph is an array of sentences. Each sentence is an ordered array of strings.',
    'Each word token must be exactly FORM:NUMBER, using the glossary number for its contextual meaning. Send punctuation as separate strings. Example sentence ["我:1","喝:1","茶:1","。"].',
    'Use only listed forms'+(bookWithCast(plan)?' and the cast name 包包:1':'')+'. Segment at natural word boundaries.',
    'Write exactly '+plan.chapterCount+' chapter(s).',
    'Use each teaching word at least once: '+[...plan.newWords,...(plan.compound?[plan.compound]:[])].join('、'),
    ...(plan.chapterCount>1?['Introduce and revisit focus words according to the chapter schedule. Build each scene around its assigned words. Avoid front-loading later targets.',
      ...chapterFocus(plan).map((words,i)=>'Chapter '+(i+1)+' focus (use each exact segmented word): '+words.join('、'))]:[]),
    'Reuse each review word in at least two distinct sentences: '+plan.reviewWords.join('、'),
    'Allowed glossary with per-word sense numbers:',glossary
  ].join('\n');
}

function title(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 180;
}
function tokenFor(raw:unknown,dictionary:Lexicon,sentence:number,chapter:number): Token {
  if(raw==='包包:1')return {text:'包包',pinyin:'Bāobāo',meaning:'Our steamed-bun friend',cast:'baobao',sentence};
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
  const invalid=new Set<string>();
  const paragraphs: Token[][] = raw.paragraphs.map((para:unknown) => {
    if (!list(para)) throw fail();
    return para.flatMap((sentence,i) => {
      if (!list(sentence)) throw fail();
      const tokens:Token[]=[];
      for(const value of sentence){
        try{tokens.push(tokenFor(value,dictionary,i,index));}
        catch(error){
          if(!(error instanceof CandidateError))throw error;
          invalid.add(String(value).slice(0,60));
        }
      }
      if (!invalid.size && !tokens.some(token => token.entry)) throw fail();
      return tokens;
    });
  });
  if(invalid.size)throw new CandidateError('Chapter '+(index+1)+' contains an unlisted form or sense: '+[...invalid].slice(0,15).join(', '),index);
  if(!Array.isArray(raw.translations) || raw.translations.length!==paragraphs.length || !raw.translations.every(isTranslation))
    throw new CandidateError('Provide one complete English translation per paragraph in the translations array, in matching order.',index);
  return {title:raw.title.trim(),paragraphs,translations:raw.translations.map((text:string)=>text.trim())};
}
function validSpeakerName(name:unknown){
  return typeof name==='string' && name.trim()===name && name.length>0 && name.length<=30;
}
function validate(candidate:any, plan:StoryPlan, dictionary:Lexicon) {
  if (!candidate || !title(candidate.title) || !Array.isArray(candidate.chapters) || candidate.chapters.length !== plan.chapterCount) {
    throw new CandidateError('Expected a title and exactly '+plan.chapterCount+' chapters.');
  }
  const chapters:Chapter[] = candidate.chapters.map((raw:unknown,i:number) => chapterFrom(raw,i,dictionary));
  const [min,max]=paragraphCounts[plan.difficulty];
  const schedule=chapterFocus(plan);
  for(const [i,chapter] of chapters.entries()){
    const format=plan.format, raw=candidate.chapters[i];
    if(plan.hskLimit&&!catalog.usesCharactersThrough(chapter.title,plan.hskLimit))throw new CandidateError('Use an English chapter title.',i);
    if(format?.type==='dialogue'){
      const {names,speakers}=raw;
      if(!Array.isArray(names)||names.length!==format.people||!names.every(validSpeakerName)||new Set(names).size!==names.length||
        (i>0 && JSON.stringify(names)!==JSON.stringify(chapters[0].names)))
        throw new CandidateError('Provide the planned distinct speaker names in the same order in every chapter.',i);
      if(!Array.isArray(speakers)||speakers.length!==messages[plan.difficulty]||speakers.length!==chapter.paragraphs.length||
        !speakers.every(n=>Number.isInteger(n)&&n>=0&&n<format.people)||new Set(speakers).size!==format.people)
        throw new CandidateError('Provide exactly '+messages[plan.difficulty]+' messages and one speaker index per message, including each participant.',i);
      if(plan.hskLimit&&names.some((name:string)=>!catalog.usesCharactersThrough(name,plan.hskLimit!)))
        throw new CandidateError('Use speaker names made from characters in the approved glossary.',i);
      chapter.names=names;chapter.speakers=speakers;
    }else if(format?.type==='article'){
      if(!articleSectionsValid(format.documents[i],raw.sections,chapter.paragraphs.length,plan.difficulty))
        throw new CandidateError('Use the required section roles for '+format.documents[i]+', one per paragraph in document order. For a letter match the planned section sequence exactly.',i);
      chapter.sections=raw.sections;
    }else if(format?.stage==='Baby book'){
      if(chapter.paragraphs.length<4||chapter.paragraphs.length>8||chapter.paragraphs.some(p=>p.some(t=>t.sentence!==0)||p.filter(t=>t.entry||t.cast).length>12))
        throw new CandidateError('Supply 4 to 8 pages with one short sentence of at most 12 words per page.',i);
    }else if(chapter.paragraphs.length<min || chapter.paragraphs.length>max)
      throw new CandidateError('Each '+plan.difficulty+' chapter requires '+min+' to '+max+' paragraphs.',i);
    if(chapter.paragraphs.some(tokens=>tokens.filter(t=>t.entry||t.cast).length>60))
      throw new CandidateError('Shorten each paragraph to at most 60 words.',i);
    if(plan.chapterCount>1){
      const assigned=schedule[i];
      const present=new Set(chapter.paragraphs.flat().map(token=>token.entry));
      const missing=assigned.filter(word=>!present.has(word));
      if(missing.length)throw new CandidateError('Include the assigned focus words in chapter '+(i+1)+': '+missing.join('、'),i);
      chapter.focus=[...new Set([...assigned,...[...plan.newCharacters,...plan.reviewCharacters??[]].filter(c=>assigned.some(word=>word.includes(c)))])];
    }
  }
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
  const prose=!plan.format || (plan.format.type==='book' && plan.format.stage!=='Baby book');
  if (prose && (count < Math.floor(plan.targetWords*0.6) || count > Math.ceil(plan.targetWords*1.5))) {
    const sizes=chapters.map(chapter=>chapter.paragraphs.flat().filter(token=>token.entry).length);
    const size=count<plan.targetWords ? Math.min(...sizes) : Math.max(...sizes);
    const revisedSize=Math.max(1,size+plan.targetWords-count);
    throw new CandidateError('The story contains '+count+' words; aim for approximately '+revisedSize+' words in the revised chapter.',sizes.indexOf(size));
  }
  const scene=chapters.flatMap(c=>c.paragraphs).find(tokens=>tokens.some(t=>t.cast));
  if(scene&&!bookWithCast(plan))throw new CandidateError('Use ordinary vocabulary in this reading, without the cast name.',chapters.findIndex(c=>c.paragraphs.includes(scene)));
  if(!scene&&bookWithCast(plan)&&(!plan.format||(plan.format.type==='book'&&plan.format.stage==='Children’s book')))throw new CandidateError('Name 包包:1 as the protagonist in the chapter text.',0);
  let teaser:string;
  let tokens:Token[];
  try{
    if(!Array.isArray(candidate.teaser)||candidate.teaser.length>90)throw Error();
    tokens=numberSentences(candidate.teaser.map((t:unknown)=>tokenFor(t,dictionary,0,0)));
    if(!bookWithCast(plan)&&tokens.some(t=>t.cast))throw Error();
    teaser=tokens.map(t=>t.text).join('');
    if(!/^(?:[^。！？]+[。！？]){1,2}$/u.test(teaser))throw Error();
  }catch{throw new CandidateError('Supply a teaser of one or two complete sentences using approved FORM:NUMBER tokens and punctuation.');}
  const titleText=candidate.title.trim() as string;
  const artwork=coverTemplate({format:plan.format,title:titleText,chapters});
  return {title:titleText,chapters,cover:{teaser,tokens,...artwork}};
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
  return {characters,reviewCharacters:plan.reviewCharacters,words:plan.newWords.map(wordPreview),compound:plan.compound?wordPreview(plan.compound):undefined,review:plan.reviewWords.map(wordPreview)};
}
export type GenerationStage = 'planning'|'writing'|'checking'|'revising'|'questions'|'saving';
export async function generateStory(store:ReadingStore,plan:StoryPlan,write:CandidateWriter=generateText,
  report:(stage:GenerationStage,detail?:string)=>void=()=>{}) {
  const story=await generateReading(plan,write,planWordReviews(store,plan),report);
  report('saving');
  store.saveStory(story);
  return story;
}

// Exam readings use the same writer and validation without creating a Library story.
export async function generateReading(plan:StoryPlan,write:CandidateWriter,rounds:ReturnType<typeof planWordReviews>=[],
  report:(stage:GenerationStage,detail?:string)=>void=()=>{},examTargets?:string[]){
  const dictionary = lexicon(plan);
  const instructions=[promptFor(plan,dictionary),...rounds.map(({chapter,words})=>
    'Use each of these word-review targets as a segmented word by the end of chapter '+(chapter+1)+': '+words.join(', ')+'.')].join('\n');
  let prompt = instructions;
  let candidate;
  let chapter: number | undefined;
  const repairs=new Map<number|string,number>();
  report('writing');
  for (;;) {
    const raw = await write(prompt);
    report('checking');
    try {
      let revision;
      try { revision = JSON.parse(raw); }
      catch { throw new CandidateError('The response contained invalid JSON.',chapter); }
      if (chapter === undefined) candidate = revision;
      else candidate.chapters[chapter] = revision;
      const accepted = validate(candidate,plan,dictionary);
      for(const {chapter,words} of rounds){
        const seen=new Set(accepted.chapters.slice(0,chapter+1).flatMap(c=>c.paragraphs.flat()).map(t=>t.entry));
        const missing=words.filter(word=>!seen.has(word));
        if(missing.length)throw new CandidateError('Include these word-review targets in the chapter: '+missing.join(', '),chapter);
      }
      const tokens=accepted.chapters.flatMap(c=>c.paragraphs.flat());
      const wordReview=[...new Set(rounds.flatMap(r=>r.words))].map(text=>{
        const {pinyin,meaning}=tokens.find(t=>t.entry===text)!;
        return {text,pinyin,meaning};
      });
      const story={id:randomUUID(),difficulty:plan.difficulty,format:plan.format,...accepted,
        preview:{...previewFor(plan,accepted.chapters),wordReview}};
      report('questions');
      for(const section of story.chapters){
        section.questions=await generateQuestions(section,plan,[...dictionary.keys(),...(section.paragraphs.some(p=>p.some(t=>t.cast))?['包包']:[]),...section.names??[]],write,examTargets);
      }
      rounds.forEach(({chapter,words},i)=>story.chapters[chapter].questions!.push(...wordReviewCards(story.chapters,chapter,words,i+1)));
      return story;
    } catch (error) {
      if (!(error instanceof CandidateError)) throw error;
      chapter = error.chapter;
      const scopeKey=chapter??'story';
      const used=repairs.get(scopeKey)??0;
      const limit=3;
      const subject=chapter===undefined?'story draft':'chapter '+(chapter+1);
      if(used>=limit)throw new CandidateError(error.message+' Reached the limit of '+limit+' automatic retries for '+subject+'. Try again.');
      repairs.set(scopeKey,used+1);
      report('revising','Correcting '+subject+' · attempt '+(used+1)+' of '+limit);
      const feedback = 'Validation feedback: '+error.message;
      if (chapter === undefined) {
        prompt = [instructions,feedback,'Supply a corrected complete story.'].join('\n');
      } else {
        const scope = 'Revise only chapter '+(chapter+1)+'. Return only its JSON object with title, paragraphs and matching English translations and all format-specific chapter fields. Keep valid sentences. Check EVERY token against the glossary. Rewrite any sentence containing an unlisted form using approved vocabulary, and use only a listed sense number. All other chapters will remain as written.';
        prompt = [instructions,feedback,scope,'Current draft:',JSON.stringify(candidate)].join('\n');
      }
    }
  }
}
