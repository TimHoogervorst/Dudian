import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {buildPlan, getPreferences, setPreferences} from '../src/story-plan.ts';
import {generateStory} from '../src/story-generation.ts';
import {withChapterQuestions} from './quiz-fixture.ts';

test('an unplanned word or invalid sense never enters saved story history', async () => {
  const store = new ReadingStore();
  const plan = {...buildPlan(store,'easy',1),targetWords:2};
  for(const invalid of ['直升机:1','茶:999','我喝茶。']) {
    const candidate = {title:'Tea',chapters:[{title:'Tea',paragraphs:[[[invalid,'。']]]}]};
    let requests=0;
    await assert.rejects(generateStory(store,plan,async()=>JSON.stringify(++requests===1 ? candidate : candidate.chapters[0])),/sense.*Try again/);
    assert.equal(requests,4);
    assert.deepEqual(store.stories().map(story=>story.id),['tea-shop']);
  }
});

test('the first generated story reopens with exact dictionary senses and budgeted targets', async () => {
  const store = new ReadingStore();
  assert.equal(getPreferences(store).ceilings.easy,2);
  const settings = {difficulty:'medium',ceilings:{easy:1,medium:2,hard:4}};
  setPreferences(store,settings);
  const plan = buildPlan(store,'easy',1);
  assert.equal(plan.newCharacters.length,1);
  assert.equal(getPreferences(store).difficulty,'medium');
  const word = plan.newWords[0];
  const sentence = [word+':1','。'];
  const candidate = {title:'At home',chapters:[{title:'A visit',paragraphs:[[sentence]]}]};
  const result = await generateStory(store,{...plan,targetWords:3},withChapterQuestions(async prompt => {
    assert.ok(prompt.includes(word));
    return JSON.stringify(candidate);
  }));
  const reopened = store.story(result.id);
  assert.deepEqual(reopened.chapters[0].translations,['Baobao is here.']);
  assert.equal(reopened.chapters[0].questions?.length,3);
  assert.deepEqual(reopened.chapters[0].questions?.[0].prompt.words,['什么']);
  const token = reopened.chapters[0].paragraphs[0][0];
  assert.equal(token.text,word);
  assert.equal(token.entry,word);
  assert.ok(token.meaning && token.sense && token.pinyin);
  assert.equal(result.preview.characters[0].text,plan.newCharacters[0]);
  assert.equal(result.preview.characters[0].example,word);
  assert.notEqual(result.id,'tea-shop');
});

test('story length sets chapters independently of the difficulty budget',t=>{
  const store=new ReadingStore();
  t.after(()=>store.db.close());
  for(const chapters of [1,2,3,4,5,6]){
    for(const [difficulty,words] of [['easy',40],['medium',80],['hard',140]] as const){
      const plan=buildPlan(store,difficulty,chapters);
      assert.equal(plan.chapterCount,chapters);
      assert.equal(plan.targetWords,chapters*words);
    }
  }
});
