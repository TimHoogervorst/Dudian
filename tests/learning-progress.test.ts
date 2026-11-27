import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustStrength,setStrength } from '../src/strength.ts';
import { learningProgress } from '../src/learning-progress.ts';

test('progress counts actual practice changes and unique items still Strong in local calendar buckets',async t=>{
  const store=await testStore();
  const {db}=store;
  const start=Date.parse('2026-03-25T00:00:00Z'), now=Date.parse('2026-03-29T23:00:00Z');
  await db.prepare('UPDATE score_tracking SET started_at=$1').run(start);
  await adjustStrength(db,'word','朋友',12,start);
  await adjustStrength(db,'word','朋友',3,start);
  await adjustStrength(db,'character','茶',6,start);
  await adjustStrength(db,'character','茶',-2,start);
  await adjustStrength(db,'character','茶',2,now);
  await setStrength(db,'word','苹果','green');
  const month=await learningProgress(store,'month','Europe/Amsterdam',now);
  assert.deepEqual([month.net,month.gained,month.lost,month.strong],[21,23,2,2]);
  assert.deepEqual(month.examples.map(i=>i.text),['茶','朋友']);
  assert.equal(month.buckets[23].points,null);
  assert.equal(month.buckets[24].points,19);
  assert.equal(month.buckets[25].points,0);
  assert.equal(month.buckets[29].points,2);
  assert.equal(month.buckets[30].points,null);
  const week=await learningProgress(store,'week','Europe/Amsterdam',now);
  assert.equal(week.buckets[0].date,'2026-03-30');
  assert.equal(week.strong,1);
  assert.equal(week.net,2);
  assert.equal((await learningProgress(store,'year','Europe/Amsterdam',now)).buckets[2].points,21);
  await assert.rejects(()=>learningProgress(store,'bad','UTC',now));
});

test('manual changes cannot earn points or restore a practice Strong milestone',async t=>{
  const store=await testStore();
  await adjustStrength(store.db,'word','朋友',6);
  await setStrength(store.db,'word','朋友','red');
  await setStrength(store.db,'word','朋友','green');
  const report=await learningProgress(store,'year','UTC');
  assert.equal(report.strong,0);
  assert.equal(report.net,6);
});
