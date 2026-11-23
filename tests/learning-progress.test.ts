import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {adjustStrength,setStrength} from '../src/strength.ts';
import {learningProgress} from '../src/learning-progress.ts';

test('progress counts actual practice changes and unique items still Strong in local calendar buckets',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  const {db}=store;
  const start=Date.parse('2026-03-25T00:00:00Z'), now=Date.parse('2026-03-29T23:00:00Z');
  db.prepare('UPDATE score_tracking SET started_at=?').run(start);
  adjustStrength(db,'word','朋友',12,start);
  adjustStrength(db,'word','朋友',3,start);
  adjustStrength(db,'character','茶',6,start);
  adjustStrength(db,'character','茶',-2,start);
  adjustStrength(db,'character','茶',2,now);
  setStrength(db,'word','苹果','green');
  const month=learningProgress(store,'month','Europe/Amsterdam',now);
  assert.deepEqual([month.net,month.gained,month.lost,month.strong],[18,20,2,2]);
  assert.deepEqual(month.examples.map(i=>i.text),['茶','朋友']);
  assert.equal(month.buckets[23].points,null);
  assert.equal(month.buckets[24].points,16);
  assert.equal(month.buckets[25].points,0);
  assert.equal(month.buckets[29].points,2);
  assert.equal(month.buckets[30].points,null);
  const week=learningProgress(store,'week','Europe/Amsterdam',now);
  assert.equal(week.buckets[0].date,'2026-03-30');
  assert.equal(week.strong,1);
  assert.equal(week.net,2);
  assert.equal(learningProgress(store,'year','Europe/Amsterdam',now).buckets[2].points,18);
  assert.throws(()=>learningProgress(store,'bad','UTC',now));
});

test('manual changes cannot earn points or restore a practice Strong milestone',t=>{
  const store=new ReadingStore();t.after(()=>store.db.close());
  adjustStrength(store.db,'word','朋友',6);
  setStrength(store.db,'word','朋友','red');
  setStrength(store.db,'word','朋友','green');
  const report=learningProgress(store,'year','UTC');
  assert.equal(report.strong,0);
  assert.equal(report.net,6);
});
