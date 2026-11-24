import type {ChapterQuestion, QuizText, Story} from './store.ts';
import type {StoryPlan} from './story-plan.ts';
import type {CandidateWriter} from './story-generation.ts';
import {storyDifficulty} from './story-difficulty.ts';

type Chapter=Story['chapters'][number];
const segmenter=new Intl.Segmenter('zh-Hans',{granularity:'word'});
const punctuation=/^[，。！？、；：“”‘’（）…—《》,.!?:;]+$/u;

export async function generateQuestions(chapter:Chapter,plan:StoryPlan,words:string[],write:CandidateWriter) {
  const allowed=new Set(words);
  const count=storyDifficulty[plan.difficulty].questions;
  const targetChars=new Set([...plan.newCharacters,...plan.reviewCharacters??[]]);
  const source=chapter.paragraphs.map((tokens,i)=>
    'Paragraph '+i+(chapter.names && chapter.speakers?' (speaker '+chapter.names[chapter.speakers[i]]+')':'')+(chapter.sections?' ('+chapter.sections[i]+')':'')+': '+tokens.map((t,j)=>j+'='+t.text).join(' '));
  const instructions=[
    'Write a chapter comprehension check. Return JSON {"questions":[...]} only.',
    'Write exactly '+count+' factual comprehension question(s) about this chapter. Test a different detail in each, drawing on different sentences and teaching targets where possible. Use three plausible distinct choices per question, exactly one supported by the cited sentence. Vary correct answer positions.',
    'Each question has prompt, choices, correct (0-2), word (the exact tested Chinese word), paragraph and token (its zero-based indices in the source), and characters (explicitly tested target characters within that word, or []).',
    'For prompt and each choice use {"zh":["segmented","words"],"en":"natural English translation"}. Each zh token must be an allowed word or Chinese punctuation.',
    'Prioritize these teaching or review words where they occur: '+[...plan.newWords,...plan.reviewWords,plan.compound].filter(Boolean).join('、'),
    'Use only allowed words and participant names in prompts and choices. Cite an ordinary vocabulary word as the learning target.',
    'Eligible target characters: '+[...targetChars].join('、'),
    'Allowed words: '+words.join('、'),
    'Chapter paragraphs with indexed tokens:',...source
  ].join('\n');
  function bilingual(value:any,field:string):QuizText {
    if(typeof value?.en!=='string'||!/[a-z]/i.test(value.en))throw Error(field+'.en needs an English translation.');
    const chunks=Array.isArray(value.zh)?value.zh:[value.zh];
    const words:string[]=[];
    for(const chunk of chunks){
      if(typeof chunk!=='string')throw Error(field+'.zh needs Chinese text split into words.');
      for(const part of chunk.match(/\p{Script=Han}+|[^\s\p{Script=Han}]+/gu)??[]){
        if(allowed.has(part)||punctuation.test(part)){words.push(part);continue;}
        for(const {segment} of segmenter.segment(part)){
          if(!allowed.has(segment))throw Error(field+'.zh contains “'+segment.slice(0,60)+'”. Rephrase using only approved words.');
          words.push(segment);
        }
      }
    }
    if(!words.some(w=>allowed.has(w)))throw Error(field+'.zh needs at least one approved word.');
    return {zh:words.join(''),words,en:value.en.trim()};
  }
  function validate(q:any):ChapterQuestion {
    const occurrence=chapter.paragraphs[q?.paragraph]?.[q?.token];
    if(!Number.isInteger(q?.paragraph)||!Number.isInteger(q?.token)||!occurrence?.entry||occurrence.entry!==q.word||occurrence.sense===undefined)
      throw Error('Cite the paragraph and token index of a vocabulary word.');
    if(!Array.isArray(q.characters)||!q.characters.every((c:unknown)=>typeof c==='string' && targetChars.has(c) && occurrence.text.includes(c)))
      throw Error('Use only eligible target characters from the cited word.');
    if(!Number.isInteger(q.correct)||q.correct<0||q.correct>2||!Array.isArray(q.choices)||q.choices.length!==3)
      throw Error('Supply three choices and a correct index from 0 to 2.');
    const choices:QuizText[]=q.choices.map((item:unknown,i:number)=>bilingual(item,'choices['+i+']'));
    if(new Set(choices.map(c=>c.zh)).size!==3||new Set(choices.map(c=>c.en.toLowerCase())).size!==3)throw Error('Supply distinct choices.');
    return {prompt:bilingual(q.prompt,'prompt'),choices,correct:q.correct,paragraph:q.paragraph,token:q.token,
      word:occurrence.entry,sense:occurrence.sense,characters:[...new Set<string>(q.characters)]};
  }
  let prompt=instructions;
  for(let attempt=0;;attempt++){
    const raw=await write(prompt);
    try{
      const {questions}=JSON.parse(raw);
      if(!Array.isArray(questions)||questions.length!==count)throw Error('Expected exactly '+count+' question(s).');
      const checked=questions.map(validate);
      if(new Set(checked.map(q=>q.prompt.zh.replace(/[\p{P}\s]/gu,''))).size!==count)throw Error('Ask a distinct question about a different chapter detail each time.');
      return checked;
    }catch(error){
      const message=error instanceof Error?error.message:'Invalid question.';
      if(attempt===2)throw Error('Unable to prepare questions for '+chapter.title+'. '+message);
      prompt=instructions+'\nPrevious draft:\n'+raw.slice(0,6000)+'\nCorrection needed: '+message+' Return the complete corrected JSON.';
    }
  }
}
