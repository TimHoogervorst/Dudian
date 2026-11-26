import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {practicePreview,confirmedPlan} from '../src/practice-preview.ts';
import {setStrength,strengthFor} from '../src/strength.ts';
import {seeItem} from '../src/encounters.ts';
import {generateReading} from '../src/story-generation.ts';
import {planWordReviews} from '../src/word-review.ts';

function preview(store:ReadingStore){
  const draft=practicePreview(store,{difficulty:'easy',chapterCount:1,type:'article'});
  return confirmedPlan(store,draft.id,'easy',1,'open');
}

test('the first score ends starter selection and encountered starter characters remain available',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const first=preview(store);
  assert.equal(first.characters?.beginner,true);
  assert.deepEqual(new Set(first.characters.available),new Set('我你是好吗'));
  assert.deepEqual(planWordReviews(store,first),[]);
  seeItem(store.db,'你好',Date.now());
  setStrength(store.db,'character','我','yellow');
  const next=preview(store);
  assert.equal(next.characters?.beginner,false);
  assert(next.characters.available.includes('好'));
  assert(!next.characters.available.includes('吗'));
  assert(!next.characters.familiar.includes('我'));
});

test('a passed band, partial familiarity and a distinct-character budget govern sentence repairs',async t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  store.db.exec('INSERT INTO milestone_passes VALUES(1)');
  setStrength(store.db,'character','快','green');
  const plan={...preview(store),newWords:['学'],newCharacters:[],reviewWords:[],compound:undefined,ceiling:1};
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
  assert.equal(strengthFor(store.db,'character','慢').score,null);
});
