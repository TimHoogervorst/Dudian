import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { finishChapter } from '../src/completion.ts';
import { history,openStory } from '../src/history.ts';
import { catalog } from '../src/catalog.ts';
import { adjustStrength,hskReadingProgress } from '../src/strength.ts';

test('HSK progress sums partially mastered bands across both Library tabs',async t=>{
  const store=await testStore();
  const db=store.db;
  assert.equal(await hskReadingProgress(db),0);
  const first=catalog.libraryItems('character',1);
  const firstWords=catalog.libraryItems('word',1);
  const missing=first[0].text;
  for(const item of first.slice(1))await adjustStrength(db,'character',item.text,6);
  for(const item of firstWords)await adjustStrength(db,'word',item.text,12);
  await adjustStrength(db,'character',missing,-3);
  assert.equal(await hskReadingProgress(db),1-1/(first.length+firstWords.length));
  for(const item of catalog.libraryItems('word',2))await adjustStrength(db,'word',item.text,3);
  assert.ok(await hskReadingProgress(db)>1 && await hskReadingProgress(db)<2);
  for(let level=1;level<=6;level++)for(const kind of ['character','word'] as const)
    for(const item of catalog.libraryItems(kind,level))await adjustStrength(db,kind,item.text,12);
  assert.equal(await hskReadingProgress(db),6);
});

test('shelf labels show the highest qualifying band and preserve saved difficulty',async t=>{
  const store=await testStore();
  await store.saveStory({id:'labels',title:'Reading',difficulty:'hard',chapters:[{title:'One',
    paragraphs:[[{text:'我'},{text:'银行'},{text:'包包',cast:'baobao'},{text:'。'}]]}]});
  const list=(await history(store)).stories;
  const story=list.find(s=>s.id==='labels')!;
  assert.equal(story.hskLevel,3);
  assert.equal(story.difficulty,'hard');
  assert.equal(list.find(s=>s.id==='tea-shop')?.difficulty,null);
  assert.deepEqual((await history(store,true)).stories.find(s=>s.id==='labels')?.focus,[]);
});

test('story tags count occurrences by band and replace legacy highest-word badges',async t=>{
  const store=await testStore();
  const fixtures=[
    {id:'mostly-one',counts:[95,0,0,5],tags:[1]},
    {id:'mostly-two',counts:[76,20,2,2],tags:[1,2]},
    {id:'at-threshold',counts:[70,20,10,0],tags:[1,2,3]},
    {id:'unclassified',counts:[0,0,0,0],tags:[]}
  ];
  for(const {id,counts} of fixtures){
    const tokens=counts.flatMap((count,i)=>Array.from({length:count},()=>({text:['我','问','银行','火'][i]})));
    await store.saveStory({id,title:id,chapters:[{title:id,paragraphs:[[...tokens,{text:'。'},{text:'火',cast:'baobao'},{text:'某某甲'}]]}]});
    await store.db.prepare('INSERT INTO story_levels (id) VALUES($1)').run(id);
  }
  for(const {id,tags} of fixtures){
    const story=(await history(store)).stories.find(s=>s.id===id)!;
    assert.deepEqual(story.hskTags,tags);
    assert.equal(story.hskLevel,tags.at(-1)??null);
  }
});

test('the reading desk resumes a started story and retains finished history on reread',async ()=>{
  const store=await testStore();
  assert.equal((await history(store)).current,null);
  const original=await store.story('tea-shop');
  await openStory(store,'tea-shop',1000);
  await store.move('tea-shop',1,2);
  assert.equal((await history(store)).current?.chapterTitle,'A rainy afternoon');
  assert.equal((await history(store)).current?.paragraph,2);
  await finishChapter(store,'tea-shop',0);
  await finishChapter(store,'tea-shop',1);
  await openStory(store,'tea-shop',2000);
  const shelf=await history(store);
  assert.equal(shelf.current,null);
  assert.equal(shelf.stories[0].finished,true);
  assert.deepEqual(await store.story('tea-shop'),original);
});
