import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {practicePreview,confirmedPlan} from '../src/practice-preview.ts';
import {adjustStrength,hskReadingProgress} from '../src/strength.ts';

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
  for(const c of draft.cards)adjustStrength(store.db,c.kind,c.text,12);
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
