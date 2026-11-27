import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadingStore } from '../src/store.ts';
import { practicePreview,confirmedPlan } from '../src/practice-preview.ts';
import { setStrength,strengthFor } from '../src/strength.ts';
import { seeItem } from '../src/encounters.ts';
import { generateReading } from '../src/story-generation.ts';
import { planWordReviews } from '../src/word-review.ts';
import { resolveStorySenses } from '../src/story-senses.ts';

async function preview(store:ReadingStore){
  const draft=await practicePreview(store,{difficulty:'easy',chapterCount:1,type:'article'});
  return confirmedPlan(store,draft.id,'easy',1,'open');
}

test('also matches one gloss of 也 locally, including the teaser',async()=>{
  const draft={chapters:[{paragraphs:[[['我:1','也=also','去:1','。']]],translations:['I am going too.']}],teaser:['也=too','。']};
  await resolveStorySenses(draft,{available:'我也去',passed:0,familiar:'',beginner:false},async()=>assert.fail('Unexpected sense request'));
  assert.deepEqual(draft.chapters[0].paragraphs[0][0],['我:1','也:1','去:1','。']);
  assert.deepEqual(draft.teaser,['也:1','。']);
});

test('ambiguous occurrences are batched and only unresolved selections are retried',async t=>{
  const store=await testStore();
  const base=await preview(store);
  const plan={...base,background:[...'我也去你他'],characters:{...base.characters!,available:'我也去你他',beginner:false},newCharacters:[],newWords:[],reviewWords:[]};
  const draft={title:'Going',chapters:[{title:'Going',sections:['notice'],paragraphs:[[['我:1','也','去:1','。'],['你:1','也:99','去:1','。']]],
    translations:['I am going too. Even you are going.']}],teaser:['我:1','去:1','。']};
  let requests=0;
  const story=await generateReading(plan,async prompt=>{
    if(prompt.startsWith('Write simplified Mandarin'))return JSON.stringify(draft);
    if(prompt.startsWith('Write a chapter comprehension check.'))return JSON.stringify({questions:[{prompt:{zh:['我'],en:'Who?'},
      choices:[['我','Me'],['你','You'],['他','Him']].map(([zh,en])=>({zh:[zh],en})),correct:0,word:'我',characters:[],paragraph:0,token:0}]});
    assert.match(prompt,/^Select the dictionary sense/);
    const items=JSON.parse(prompt.split('\n').at(-1)!);
    const [a,b]=['c1-p1-s1-t2','c1-p1-s2-t2'];
    if(++requests===1){
      assert.deepEqual(items.map((item:{id:string})=>item.id),[a,b]);
      assert.equal(items[0].sentence,'我【也】去。');
      assert.equal(items[0].translation,draft.chapters[0].translations[0]);
      return JSON.stringify({selections:[{id:a,sense:1},{id:b,sense:2},{id:b,sense:1}]});
    }
    assert.deepEqual(items.map((item:{id:string})=>item.id),[b]);
    return JSON.stringify({selections:[{id:b,sense:requests===2?999:2}]});
  });
  assert.equal(requests,3);
  assert.deepEqual(story.chapters[0].translations,draft.chapters[0].translations);
  const words=story.chapters[0].paragraphs[0];
  assert.equal(words.map(t=>t.text).join(''),'我也去。你也去。');
  assert.notEqual(words[1].sense,words[5].sense);
});

test('the first score ends starter selection and encountered starter characters remain available',async t=>{
  const store=await testStore();
  const first=await preview(store);
  assert.equal(first.characters?.beginner,true);
  assert.deepEqual(new Set(first.characters.available),new Set('我你是好吗'));
  assert.deepEqual(await planWordReviews(store,first),[]);
  await seeItem(store.db,'你好',Date.now());
  await setStrength(store.db,'character','我','yellow');
  const next=await preview(store);
  assert.equal(next.characters?.beginner,false);
  assert(next.characters.available.includes('好'));
  assert(!next.characters.available.includes('吗'));
  assert(!next.characters.familiar.includes('我'));
});

test('a passed band, partial familiarity and a distinct-character budget govern sentence repairs',async t=>{
  const store=await testStore();
  await store.db.prepare('INSERT INTO milestone_passes(level) VALUES(1)').run();
  await setStrength(store.db,'character','快','green');
  const plan={...await preview(store),newWords:['学'],newCharacters:[],reviewWords:[],compound:undefined,ceiling:1};
  assert.equal(plan.characters?.passed,1);
  assert.equal(plan.characters.familiar,'快');
  const first=['你好','说:2','学:1','快:1','。'];
  const second=['慢','慢','跑:1','。'];
  const draft={title:'Greeting',teaser:['你好','。'],chapters:[{title:'Notice',sections:['notice','notice'],
    paragraphs:[[first],[second]],translations:['Hello.','Slowly.']}]};
  let repairs=0;
  const story=await generateReading(plan,async prompt=>{
    if(prompt.startsWith('Write a chapter comprehension check.')){
      assert(prompt.includes('慢'));
      return JSON.stringify({questions:[{prompt:{zh:['谁'],en:'Who?'},choices:[['你','You'],['我','Me'],['他','Him']].map(([zh,en])=>({zh:[zh],en})),
        correct:0,word:'你好',characters:[],paragraph:0,token:0}]});
    }
    if(!prompt.includes('Validation feedback:')){
      assert(prompt.includes('Familiar through HSK 2.0 level 1'));
      assert(prompt.includes('Additional strong characters: 快'));
      return JSON.stringify(draft);
    }
    assert.match(prompt,/Replace only sentence 1 in paragraph 2 of chapter 1/);
    repairs++;
    if(repairs===1){
      assert.match(prompt,/ceiling of 1/);
      return JSON.stringify({sentence:['鲸:1','。'],translation:'A whale.'});
    }
    assert.match(prompt,/ineligible character in 鲸/);
    return JSON.stringify({sentence:['慢','慢','。'],translation:'Slowly, slowly.',chapters:[]});
  });
  assert.equal(repairs,2);
  assert.deepEqual(story.chapters[0].paragraphs[0].map(t=>t.text),['你好','说','学','快','。']);
  assert.deepEqual(story.chapters[0].translations,['Hello.','Slowly, slowly.']);
  assert.deepEqual(story.preview.characters.map(item=>item.text),['慢']);
  assert.equal((await strengthFor(store.db,'character','慢')).score,null);
});
