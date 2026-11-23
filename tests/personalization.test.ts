import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadingStore } from '../src/store.ts';
import { recordAction } from '../src/word-actions.ts';
import { buildPlan } from '../src/story-plan.ts';
import { finishChapter } from '../src/completion.ts';
import { catalog } from '../src/catalog.ts';
import { startSession, gradeCard } from '../src/flashcards.ts';
import { generateStory } from '../src/story-generation.ts';

const day = 86_400_000;
test('marked words remain available as background, then become deliberate review targets exactly one day later', async t => {
  const store = new ReadingStore();
  t.after(()=>store.db.close());
  const text = store.story('tea-shop').chapters[0].paragraphs[0];
  const at = Date.UTC(2026,4,10,15);
  for (const word of ['茶','我','朋友']) {
    recordAction(store,{storyId:'tea-shop',chapter:0,paragraph:0,token:text.findIndex(t=>t.text===word),id:word,kind:'difficulty'},at);
  }
  const soon = buildPlan(store,'medium',10,at+day-1);
  assert(soon.background.includes('茶'));
  assert(![...soon.newWords,...soon.reviewWords].includes('茶'));
  const due = buildPlan(store,'hard',30,at+day);
  assert.deepEqual([...due.reviewWords].sort(),['我','茶','朋友'].sort());
  assert.equal(due.newCharacters.length,0);
  const sentence=due.reviewWords.map(word=>word+':1');
  const story=await generateStory(store,{...due,chapterCount:1,targetWords:6},async()=>JSON.stringify({
    title:'Reunion',chapters:[{title:'Tea',paragraphs:[[[...sentence,'。'],[...sentence.reverse(),'。']]]}],
  }));
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
