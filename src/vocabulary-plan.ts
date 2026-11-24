import {catalog} from './catalog.ts';
import {hskReadingProgress,recordedStrengths,reviewCandidates} from './strength.ts';
import {perfectScore} from './encounters.ts';
import {ensureActions} from './word-actions.ts';
import {flashcardHistory} from './flashcards.ts';
import type {ReadingStore} from './store.ts';
import {ensureCompletions} from './completion.ts';
import type {Difficulty} from './story-plan.ts';
import {storyDifficulty} from './story-difficulty.ts';
import {nextTestLevel,unseenCharacters,unseenFocusChance} from './milestone-progress.ts';

const day = 86_400_000;

function readingEvidence(store:ReadingStore) {
  const {db}=store;
  ensureCompletions(db);
  const recent=db.prepare(`SELECT c.story_id,c.chapter,c.at,
    json_extract(s.content,'$.chapters['||c.chapter||'].paragraphs') AS paragraphs
    FROM chapter_completions c JOIN stories s ON s.id=c.story_id ORDER BY c.at DESC`).all();
  const seen=new Map<string,{count:number;at:number}>();
  let aided=0, encountered=0;
  for (const [index,row] of recent.entries()) {
    const paragraphs=JSON.parse(String(row.paragraphs));
    const words=new Set<string>(paragraphs.flat().filter((t:{cast?:string})=>!t.cast).map((t:{text:string})=>t.text).filter((w:string)=>/\p{Script=Han}/u.test(w)));
    for (const word of words) {
      const last=seen.get(word);
      seen.set(word,{count:(last?.count??0)+1,at:last?.at??Number(row.at)});
    }
    if(index<3) {
      encountered+=words.size;
      const actions=db.prepare('SELECT count(DISTINCT word) AS count FROM word_actions WHERE story_id=? AND chapter=? AND at<=?')
        .get(row.story_id,row.chapter,row.at);
      aided+=Number(actions?.count??0);
    }
  }
  return {seen,chapters:recent.length,comfortable:recent.length>=2 && aided/Math.max(1,encountered)<=0.15};
}

export function vocabularyFor(store:ReadingStore, difficulty:Difficulty, ceiling:number, now:number, excluded:ReadonlySet<string>=new Set(),focusLimit:number=storyDifficulty[difficulty].focusCards) {
  const {db}=store;
  const strengths=reviewCandidates(db,now);
  const attempts=flashcardHistory(db);
  ensureActions(db);
  const reading=readingEvidence(store);
  const marks=db.prepare("SELECT word,max(at) AS at FROM word_actions WHERE kind='difficulty' GROUP BY word").all();
  const lastMark=new Map(marks.map(row=>[String(row.word),Number(row.at)]));
  const perfect=new Set(strengths.filter(i=>i.score===perfectScore).map(i=>i.text));
  const available=(word:string)=>!lastMark.has(word) || now-lastMark.get(word)!>=day;
  const eligible=(word:string)=>available(word) && !excluded.has(word) && !perfect.has(word);
  const knownWords=new Set(strengths.filter(i=>i.kind==='word'||catalog.isCurriculumWord(i.text)).map(i=>i.text));
  const knownCharacters=new Set(strengths.filter(i=>i.kind==='character').map(i=>i.text));
  const baseline=catalog.list('word',1);
  const background=[...new Set([...baseline.map(i=>i.text),...knownWords,...lastMark.keys()])];
  const allowedBackground=new Set(background);
  const attemptsByItem=new Map(attempts.map(a=>[a.kind+'/'+a.text,a]));

  const candidates=strengths.map(item=>{
    const word = item.kind==='word' || knownWords.has(item.text) || baseline.some(i=>i.text===item.text)
      ? item.text : catalog.get('character',item.text)?.examples.find(i=>eligible(i.text) && allowedBackground.has(i.text))?.text;
    const history=attemptsByItem.get(item.kind+'/'+item.text);
    const seen=reading.seen.get(word??'');
    return {...item,word,count:(history?.count??0)+(seen?.count??0),at:Math.max(history?.at??0,seen?.at??0,lastMark.get(word??'')??0)};
  }).filter(item=>item.score<perfectScore && item.word && !excluded.has(item.text) && eligible(item.word));
  const learning=candidates.filter(item=>item.score<6)
    .sort((a,b)=>a.score-b.score || a.count-b.count || a.at-b.at || a.text.localeCompare(b.text));
  const fallback=candidates.filter(item=>knownWords.has(item.text))
    .sort((a,b)=>a.at-b.at || a.count-b.count || a.text.localeCompare(b.text))[0];
  const reviews=learning.length ? [...new Set(learning.map(i=>i.word!))] : fallback ? [fallback.word!] : [];
  const difficult=new Set(candidates.filter(i=>i.score<0).map(i=>i.word));
  const due=candidates.filter(item=>item.dueAt<=now).sort((a,b)=>a.dueAt-b.dueAt)[0];
  const hard=difficulty==='hard';
  const targetLevel=nextTestLevel(db);
  const progress=hskReadingProgress(db)-(targetLevel-1);
  const band=catalog.libraryItems('character',targetLevel);
  const rated=new Set(recordedStrengths(db).map(item=>item.text));
  const libraryUnseen=new Set(band.filter(item=>!rated.has(item.text)).map(item=>item.text));
  const chance=libraryUnseen.size?unseenFocusChance(progress,1-libraryUnseen.size/band.length):0;
  const nearMilestone=hard&&focusLimit===12&&chance===1;
  const priorityReviews=hard&&!nearMilestone?reviews.filter(word=>difficult.has(word)):reviews;
  const reviewWords=[...new Set([...(due?[due.word!]:[]),...priorityReviews])].slice(0,hard&&!nearMilestone?focusLimit:3);
  const budget=hard?Math.min(ceiling,focusLimit-reviewWords.length)
    :difficult.size>=3?0:Math.max(0,ceiling-difficult.size);
  const common=['茶','水','家','人','书','好','看','吃','来','去'];
  const newCharacters:string[]=[], newWords:string[]=[];
  const missing=new Set(unseenCharacters(db,targetLevel));
  const levelWords=catalog.list('word',targetLevel).map(item=>item.text);
  // A word with manually assigned strength can still contain an unseen character.
  function* coverageTargets(){
    for(const word of levelWords){
      if(!eligible(word)||reviewWords.includes(word))continue;
      for(const text of word){
        if(libraryUnseen.has(text)&&eligible(text)&&!newCharacters.includes(text)&&!(hard&&newWords.includes(word)))
          yield {text,word};
      }
    }
  }
  const unseen=coverageTargets();
  function addTarget(text:string,word:string){
    if (!eligible(word) || excluded.has(text) || knownCharacters.has(text) || newCharacters.includes(text) || knownWords.has(word) || reviewWords.includes(word)) return;
    if(chance>0&&!libraryUnseen.has(text)&&Math.random()<chance){
      const preferred=unseen.next().value;
      if(preferred){text=preferred.text;word=preferred.word;}
    }
    newCharacters.push(text);
    if (!newWords.includes(word)) newWords.push(word);
  }

  // Introduce the next band occasionally after two comfortable chapter completions.
  // Higher bands open once most of the preceding band's words have been encountered.
  let nextLevel=2;
  while (nextLevel<6) {
    const band=catalog.list('word',nextLevel);
    if (band.filter(i=>knownWords.has(i.text)).length < band.length*0.75) break;
    nextLevel++;
  }
  const nextBand=catalog.list('word',nextLevel);
  const availableCharacters=new Set(background.join(''));
  if(nearMilestone&&budget){
    const words=[...levelWords].sort((a,b)=>Number(knownWords.has(a))-Number(knownWords.has(b)));
    for(const word of words){
      if(newCharacters.length>=budget)break;
      if(!eligible(word)||reviewWords.includes(word))continue;
      const chars=[...new Set(word)].filter(c=>libraryUnseen.has(c)&&eligible(c)&&!newCharacters.includes(c))
        .slice(0,budget-newCharacters.length);
      const unfamiliar=[...new Set(word)].filter(c=>!availableCharacters.has(c)&&!newCharacters.includes(c));
      if(!chars.length||unfamiliar.some(c=>!chars.includes(c)))continue;
      newCharacters.push(...chars);
      newWords.push(word);
    }
  }
  const unresolved=strengths.filter(i=>i.score<0).length;
  if (newCharacters.length<budget && reading.comfortable && unresolved<=2 && reading.chapters%3===2) {
    for (const {text:word} of nextBand) {
      const novel=[...new Set(word)].filter(c=>!availableCharacters.has(c));
      if (novel.length!==1 || catalog.get('character',novel[0])?.level!==nextLevel) continue;
      addTarget(novel[0],word);
      if (newWords.length) break;
    }
  }
  const favored=[...new Set([...common,...baseline.map(i=>i.text)])];
  for(const word of [...common,...levelWords]){
    if(newCharacters.length>=budget)break;
    const character=[...word].find(c=>missing.has(c)&&!newCharacters.includes(c));
    if(character)addTarget(character,word);
  }
  for (const word of favored) {
    if (newCharacters.length>=budget) break;
    if ([...word].length===1) addTarget(word,word);
  }
  for (const {text:word} of baseline) {
    for (const char of word) {
      if (newCharacters.length>=budget || (hard && newWords.includes(word))) break;
      addTarget(char,word);
    }
    if (newCharacters.length>=budget) break;
  }
  // The ordinary pool can be exhausted before the character budget (e.g. after manual ratings).
  const remainingSlots=Math.min(budget-newCharacters.length,libraryUnseen.size);
  for(let slot=0;chance>0&&slot<remainingSlots;slot++){
    if(Math.random()>=chance)continue;
    const preferred=unseen.next().value;
    if(!preferred)break;
    newCharacters.push(preferred.text);
    if(!newWords.includes(preferred.word))newWords.push(preferred.word);
  }
  // Ordinary introductions can still supply a missing encounter when manual ratings
  // gave a character strength before its first reading.
  if(missing.size&&newCharacters.length<budget){
    for(const word of levelWords){
      if(!eligible(word)||reviewWords.includes(word)||newWords.includes(word))continue;
      const text=[...word].find(c=>missing.has(c)&&eligible(c)&&!newCharacters.includes(c));
      if(!text)continue;
      newWords.push(word);newCharacters.push(text);
      if(newCharacters.length>=budget)break;
    }
  }
  const roomForCompound=!hard || reviewWords.length+newWords.length<focusLimit;
  const compound=roomForCompound && budget>0 && reading.comfortable ? nextBand.find(({text})=>
    [...text].length>1 && !allowedBackground.has(text) && eligible(text)
    && !newWords.includes(text) && [...text].every(c=>knownCharacters.has(c)))?.text : undefined;
  if(hard){
    const remaining=focusLimit-reviewWords.length-newWords.length-Number(Boolean(compound));
    const extraReviews=reviews.filter(word=>!reviewWords.includes(word) && !newWords.includes(word) && word!==compound);
    reviewWords.push(...extraReviews.slice(0,remaining));
  }
  if(focusLimit>storyDifficulty[difficulty].focusCards){
    const selected=new Set([...reviewWords,...newWords,...(compound?[compound]:[])]);
    if(selected.size<focusLimit){
      // Preserve introductions, then fill longer stories with further review and background words.
      const ranked=candidates.slice().sort((a,b)=>a.dueAt-b.dueAt||a.score-b.score||a.at-b.at);
      for(const word of [...reviews,...ranked.map(item=>item.word!),...background]){
        if(selected.size>=focusLimit)break;
        if(selected.has(word)||!eligible(word)||!catalog.get('word',word))continue;
        reviewWords.push(word);
        selected.add(word);
      }
    }
  }
  const reviewCharacters=candidates.filter(item=>item.kind==='character' && item.word && reviewWords.includes(item.word)).map(item=>item.text);
  const strongCharacters=strengths.filter(item=>item.kind==='character' && item.score>=6).length;
  return {background,newCharacters,newWords,reviewWords,reviewCharacters,compound,strongCharacters};
}
