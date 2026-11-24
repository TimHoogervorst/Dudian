import {messages,type ArticleKind} from './reading-types.ts';
import {paragraphCounts,type Difficulty,type StoryPlan} from './story-plan.ts';

const sections:Record<ArticleKind,readonly string[]>={
  'Notice':['notice'],
  'Letter':['greeting','body','signature'],
  'Recipe':['ingredients','step'],
  'Short news report':['lead','report']
};
function letterSections(difficulty:Difficulty){
  const bodies={easy:1,medium:2,hard:3}[difficulty];
  return ['greeting',...Array<string>(bodies).fill('body'),'signature'];
}
export function formatRules(plan:StoryPlan){
  const format=plan.format;
  if(format?.type==='dialogue'){
    const count=messages[plan.difficulty];
    return [
      'Write a natural Mandarin messaging conversation with one theme across chapters. Use short colloquial turns, familiar forms of address and natural omissions. Group chats can answer earlier messages after the topic changes; leave enough context to follow the reply.',
      'Each chapter has exactly '+count+' paragraphs, one message per paragraph. Include names (an array of exactly '+format.people+' distinct short display names) and speakers (one zero-based name index per message). Use every participant and keep names in identical order across chapters. Index 0 represents the learner. Use natural Chinese display names. Names are metadata outside the glossary.'
    ].join('\n');
  }
  if(format?.type==='article')return [
    'Write a collection of complete independent Mandarin documents. Honor the selected subject if supplied. Chapter documents in order: '+format.documents.join(', ')+'. Give each an English title identifying its subject.',
    'Provide a sections array with one role per paragraph. Required roles in order for each format: '+JSON.stringify({...sections,Letter:letterSections(plan.difficulty)})+'. For letters use the exact sequence shown, one substantive body paragraph per body entry. For other formats repeat roles as needed. Write concise actionable notices, complete letters with a greeting and signature, recipes with ingredients and ordered steps, or factual short reports with a lead and details.'
  ].join('\n');
  if(format?.stage==='Baby book')return 'Write a very simple baby book. Each chapter has 4 to 8 pages. Each paragraph is one page with exactly one short sentence of at most 12 words. Use repetition and one concrete change per page. End each page after one sentence. Bāobāo may appear. Keep one narrative across all chapters.';
  const cast=!format||format.stage==='Children’s book';
  return [
    cast?'The protagonist is always 包包 (Bāobāo), a little cream-colored steamed bun with a green satchel. Use 包包:1 as his name. Write a picture-book adventure with a concrete goal and visible outcome.':'Write a chapter book with a single unfolding plot. Carry clues, motivations or consequences from one scene into the next.',
    'Write approximately '+plan.targetWords+' word occurrences. Every chapter must have '+paragraphCounts[plan.difficulty].join(' to ')+' paragraphs. Aim for 40 segmented words per paragraph.'
  ].join('\n');
}
export function articleSectionsValid(kind:ArticleKind,roles:unknown,count:number,difficulty:Difficulty):roles is string[]{
  if(!Array.isArray(roles)||roles.length!==count)return false;
  if(kind==='Letter'){
    const expected=letterSections(difficulty);
    return count===expected.length && expected.every((role,i)=>roles[i]===role);
  }
  const expected=sections[kind];
  const runs=roles.filter((role,i)=>i===0||roles[i-1]!==role);
  return runs.length===expected.length && runs.every((role,i)=>role===expected[i]);
}
export function bookWithCast(plan:StoryPlan){
  return !plan.format || (plan.format.type==='book' && plan.format.stage!=='Chapter book');
}
