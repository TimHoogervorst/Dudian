import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {practicePreview,confirmedPlan} from '../src/practice-preview.ts';
import {adjustStrength,hskReadingProgress,setStrength} from '../src/strength.ts';
import {setPreferences} from '../src/story-plan.ts';

test('Hard fills six focus cards with struggling reviews and eligible new characters',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const struggling=['昨天','先生','椅子','学生','老师','朋友'];
  for(const word of struggling.slice(0,3))setStrength(store.db,'word',word,'red');
  setStrength(store.db,'word','东西','yellow');
  const preview=()=>practicePreview(store,{difficulty:'hard',minutes:30});
  const mixed=preview();
  const plan=confirmedPlan(store,mixed.id,'hard',30);
  assert.deepEqual(new Set(plan.reviewWords),new Set(struggling.slice(0,3)));
  assert.deepEqual(mixed.cards.map(c=>c.color),['red','red','red','gray','gray','gray']);
  assert.equal(plan.newCharacters.length,3);
  assert.equal(practicePreview(store,{difficulty:'medium',minutes:30}).cards.length,3);
  assert.equal(practicePreview(store,{difficulty:'easy',minutes:30}).cards.length,2);
  setPreferences(store,{difficulty:'hard',ceilings:{easy:2,medium:3,hard:1}});
  const limited=preview();
  assert.equal(confirmedPlan(store,limited.id,'hard',30).newCharacters.length,1);
  assert.ok(limited.cards.some(c=>c.text==='东西'));
  for(const word of struggling.slice(3))setStrength(store.db,'word',word,'red');
  assert.deepEqual(new Set(preview().cards.map(c=>c.text)),new Set(struggling));
});

test('a reroll replaces one focus, survives resizing, and binds generation to its preview', t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'medium',minutes:10} as const;
  const first=practicePreview(store,options);
  assert.ok(first.cards.length>=2 && first.cards.length<=6);
  const second=practicePreview(store,{...options,previewId:first.id,reroll:first.cards[0].text});
  assert.notEqual(second.cards[0].text,first.cards[0].text);
  assert.deepEqual(second.cards.slice(1),first.cards.slice(1));
  const longer=practicePreview(store,{...options,minutes:20,previewId:second.id});
  const words=longer.cards.map(c=>c.text);
  assert.deepEqual(words,second.cards.map(c=>c.text));
  const plan=confirmedPlan(store,longer.id,'medium',20);
  assert.deepEqual(new Set([...plan.reviewWords,...plan.newWords,...(plan.compound?[plan.compound]:[])]),new Set(words));
  assert.throws(()=>confirmedPlan(store,longer.id,'hard',20));
  assert.ok(longer.projected>second.projected);
  assert.equal(hskReadingProgress(store.db),0);
});

test('practice estimates respect strength and HSK caps', t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'hard',minutes:30} as const;
  const draft=practicePreview(store,options);
  for(const c of draft.cards)adjustStrength(store.db,c.kind,c.text,36);
  const full=practicePreview(store,{...options,previewId:draft.id});
  assert.ok(full.cards.every(c=>c.gain===0));
  assert.equal(full.projected,full.level);
});
test('each practice visit rotates five subjects and the confirmed plan uses the chosen one',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const options={difficulty:'easy',minutes:10} as const;
  const first=practicePreview(store,options);
  const next=practicePreview(store,options);
  assert.equal(new Set(next.subjects.map(s=>s.zh)).size,5);
  assert.ok(next.subjects.every(s=>!first.subjects.some(other=>s.zh===other.zh)));
  const resized=practicePreview(store,{...options,minutes:20,previewId:next.id});
  assert.deepEqual(resized.subjects,next.subjects);
  const chosen=next.subjects[3];
  assert.deepEqual(confirmedPlan(store,resized.id,'easy',20,chosen.zh).subject,chosen);
  assert.throws(()=>confirmedPlan(store,next.id,'easy',10,'unknown'));
});
