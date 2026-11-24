import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadingStore } from '../src/store.ts';
import { recordAction } from '../src/word-actions.ts';
import { buildPlan } from '../src/story-plan.ts';
import { finishChapter } from '../src/completion.ts';
import { catalog } from '../src/catalog.ts';
import { startSession, gradeCard } from '../src/flashcards.ts';
import { generateStory } from '../src/story-generation.ts';
import {withChapterQuestions} from './quiz-fixture.ts';
import {unseenCharacters,unseenFocusChance} from '../src/milestone-progress.ts';
import {setStrength} from '../src/strength.ts';
import {seeItem} from '../src/encounters.ts';

const day = 86_400_000;

test('coverage preference interpolates only when behind the target for this level',()=>{
  for(const [progress,target,chance] of [[.3,.2,.3],[.5,.4,.5],[.6,.55,.6],[.7,.75,.75],[.75,.825,.825],[.8,.9,.9],[.9,1,1]]){
    assert(Math.abs(unseenFocusChance(progress,target-.001)-chance)<1e-12);
    assert.equal(unseenFocusChance(progress,target),0);
  }
  assert.equal(unseenFocusChance(.29,0),0);
  assert.equal(unseenFocusChance(1.3,.999),1);
  assert.equal(unseenFocusChance(1.3,1),0);
});

test('a late missing character takes a focus slot even in familiar words and stays unseen until encountered',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store;
  const chars=catalog.libraryItems('character',2);
  const last=chars.at(-1)!.text;
  // Manual strength contributes to the score independently of milestone coverage.
  for(const level of [1,2])for(const kind of ['character','word'] as const){
    for(const {text} of catalog.libraryItems(kind,level))setStrength(db,kind,text,'green');
  }
  for(const {text} of chars)if(text!==last)seeItem(db,text,Date.now());
  db.prepare("INSERT INTO milestone_tests(id,level,status,sections) VALUES('first',1,'passed','[]')").run();
  setStrength(db,'word','朋友','red');
  seeItem(db,'朋友',Date.now()-10*day);
  const plan=buildPlan(store,'hard',10,Date.now()+8*day);
  assert(plan.reviewWords.includes('朋友'));
  assert(plan.newCharacters.includes(last));
  assert(plan.newWords.some(word=>word.includes(last)));
  assert.deepEqual(unseenCharacters(db,2),[last]);
  assert(!buildPlan(store,'hard',10,Date.now(),new Set([last])).newCharacters.includes(last));
});
test('a learner with only strong words reviews the least recently practiced eligible word',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  for(const [i,word] of ['茶','水','我'].entries()){
    for(const date of [day,2*day,3*day,4*day]){
      const session=startSession(store.db,{kind:'word',words:[word]});
      gradeCard(store.db,session.id,0,'correct',date+i*1000);
    }
  }
  assert.deepEqual(buildPlan(store,'medium',10,5*day).reviewWords,['茶']);
  const line=store.story('tea-shop').chapters[0].paragraphs[0];
  recordAction(store,{storyId:'tea-shop',chapter:0,paragraph:0,token:line.findIndex(t=>t.text==='茶'),id:'tea',kind:'difficulty'},5*day);
  assert.deepEqual(buildPlan(store,'medium',10,5*day+1).reviewWords,['水']);
});
test('marked words remain available as background, then become deliberate review targets exactly one day later', async t => {
  const store = new ReadingStore();
  t.after(()=>store.db.close());
  const text = store.story('tea-shop').chapters[0].paragraphs[0];
  const at = Date.UTC(2026,4,10,15);
  for (const word of ['茶','我','朋友']) {
    recordAction(store,{storyId:'tea-shop',chapter:0,paragraph:0,token:text.findIndex(t=>t.text===word),id:word,kind:'difficulty'},at);
  }
  finishChapter(store,'tea-shop',0,at);
  finishChapter(store,'tea-shop',1,at);
  const soon = buildPlan(store,'medium',10,at+day-1);
  assert(soon.background.includes('茶'));
  assert(![...soon.newWords,...soon.reviewWords].includes('茶'));
  const due = buildPlan(store,'hard',10,at+day);
  assert.deepEqual([...due.reviewWords].sort(),['我','茶','朋友'].sort());
  assert.equal(due.newCharacters.length,3);
  const sentence=[...due.reviewWords,...due.newWords].map(word=>word+':1');
  const story=await generateStory(store,{...due,chapterCount:1,targetWords:30},withChapterQuestions(async prompt=>JSON.stringify({
    title:'Reunion',chapters:[{title:'Tea',paragraphs:[[[...sentence,...[...prompt.matchAll(/segmented word by the end of chapter 1: (.+)\./g)].flatMap(m=>m[1].split(', ').map(w=>w+':1')),'。']],[[...sentence,'。']],[[...sentence,'。']]]}],
  }),3));
  assert.deepEqual(story.preview.review.map(w=>w.text),due.reviewWords);
});

test('comfortable chapters can introduce the next level while HSK 1 is still largely unseen', t=>{
  const store=new ReadingStore();
  t.after(()=>store.db.close());
  finishChapter(store,'tea-shop',0,day);
  finishChapter(store,'tea-shop',1,2*day);
  const plan=buildPlan(store,'easy',10,3*day);
  assert(plan.newCharacters.some(c=>catalog.get('character',c)?.level===2));
  assert(plan.newCharacters.length<=2);
  assert(plan.newCharacters.every(c=>plan.newWords.some(word=>word.includes(c))));
});

test('a missed flashcard is eligible without waiting and outranks lightly encountered material', t=>{
  const store=new ReadingStore();
  t.after(()=>store.db.close());
  finishChapter(store,'tea-shop',0,day);
  const deck=startSession(store.db,{kind:'word',words:['银行']});
  gradeCard(store.db,deck.id,0,'incorrect',2*day);
  assert.equal(buildPlan(store,'medium',10,2*day).reviewWords[0],'银行');
});
