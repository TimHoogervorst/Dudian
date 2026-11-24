import {articleSectionsValid} from '../src/reading-format.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {generateStory} from '../src/story-generation.ts';
import {confirmedPlan,practicePreview} from '../src/practice-preview.ts';
import {articleDocuments,progression,readingOptions,type ReadingFormat} from '../src/reading-types.ts';
import type {StoryPlan} from '../src/story-plan.ts';

test('milestones, book stages and document pools agree at inclusive boundaries',()=>{
  for(const [level,unlocked] of [[0,3],[0.199,3],[0.2,4],[0.5,5],[1,7],[2,10],[3,11]]){
    const cards=progression(level).flatMap(group=>group.cards);
    assert.equal(cards.filter(card=>card.unlocked).length,unlocked);
    assert.equal(cards.find(card=>card.current)?.label,readingOptions(level).stage);
  }
  assert.deepEqual(new Set(articleDocuments(1,2)),new Set(['Letter','Recipe']));
  assert.deepEqual(articleDocuments(0.499,2),['Notice','Notice']);
  assert.deepEqual(articleDocuments(0.5,2),['Letter','Letter']);
  assert.deepEqual(new Set(articleDocuments(2,3)),new Set(['Letter','Recipe','Short news report']));
});

test('letters require one greeting, the selected number of body paragraphs, and one signature',()=>{
  for(const difficulty of ['easy','medium','hard'] as const){
    for(const count of [1,2,3]){
      const roles=['greeting',...Array(count).fill('body'),'signature'];
      assert.equal(articleSectionsValid('Letter',roles,roles.length,difficulty),count==={easy:1,medium:2,hard:3}[difficulty]);
    }
  }
});

test('the preview pins the participant count and supports an open subject',t=>{
  const store=new ReadingStore();
  t.after(()=>store.db.close());
  const first=practicePreview(store,{difficulty:'easy',minutes:10,type:'dialogue'});
  const next=practicePreview(store,{difficulty:'medium',minutes:20,type:'dialogue',previewId:first.id});
  const plan=confirmedPlan(store,next.id,'medium',20,'open');
  assert.deepEqual(plan.format,{type:'dialogue',people:first.options.people});
  assert.equal(plan.subject,undefined);
});

test('chat, recipe and baby book content survives generation, questions and storage',async t=>{
  const store=new ReadingStore();
  t.after(()=>store.db.close());
  const formats:ReadingFormat[]=[{type:'dialogue',people:5},{type:'article',documents:['Recipe']},{type:'book',stage:'Baby book'}];
  for(const format of formats){
    const plan:StoryPlan={format,difficulty:'easy',minutes:10,chapterCount:1,targetWords:40,ceiling:0,
      background:['水','茶','家','什么'],newCharacters:[],newWords:[],reviewWords:[]};
    const count=format.type==='dialogue'?6:4;
    const chapter={title:'Tea',paragraphs:Array.from({length:count},()=>[['茶:1','。']]),translations:Array(count).fill('Tea.'),
      ...(format.type==='dialogue'?{names:['我','妈妈','爸爸','姐姐','弟弟'],speakers:[0,1,2,3,4,1]}:{}),
      ...(format.type==='article'?{sections:['ingredients','ingredients','step','step']}:{})};
    const text=(word:string,en:string)=>({zh:[word],en});
    const question={prompt:text('什么','What?'),choices:[text('茶','Tea'),text('水','Water'),text('家','Home')],
      correct:0,word:'茶',paragraph:0,token:0,characters:[]};
    let drafts=0;
    const result=await generateStory(store,plan,async prompt=>{
      if(prompt.startsWith('Write a chapter comprehension check'))return JSON.stringify({questions:[question]});
      if(++drafts===2){
        assert.match(prompt,/Revise only chapter 1/);
        return JSON.stringify(chapter);
      }
      const invalid=format.type==='dialogue'?{...chapter,speakers:[0,1]}:
        format.type==='article'?{...chapter,sections:['notice']}:chapter;
      return JSON.stringify({title:'Tea',teaser:['茶:1','。'],chapters:[invalid]});
    });
    assert.equal(drafts,format.type==='book'?1:2);
    const saved=store.story(result.id);
    assert.deepEqual(saved.format,format);
    assert.deepEqual(saved.chapters[0].speakers,chapter.speakers);
    assert.deepEqual(saved.chapters[0].sections,chapter.sections);
    assert.equal(saved.chapters[0].questions?.length,1);
    assert.equal(saved.cover?.reference,false);
    assert.match(saved.cover!.prompt,format.type==='article'?/photograph/:format.type==='dialogue'?/colored-pencil/:/gouache/);
  }
});
