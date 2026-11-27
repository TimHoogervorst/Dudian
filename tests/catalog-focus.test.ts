import test from 'node:test';
import assert from 'node:assert/strict';
import {focusDeck} from '../admin/focus-deck.js';
import {focusBudget} from '../src/story-difficulty.ts';
import {catalogPlan} from '../src/admin/jobs.ts';

test('chapter budgets fill ranked slots, and rerolling or deselecting one keeps its neighbors',()=>{
  const deck=focusDeck(),ranked=[...'我你他她是好水茶吃喝看有在吗'];
  const fill=(chapters:number)=>deck.fill('1/hard',ranked,focusBudget('hard',chapters));
  assert.equal(fill(1).length,6);
  assert.deepEqual(deck.selected(),ranked.slice(0,6));
  deck.toggle(1);deck.reroll(2);
  assert.deepEqual(deck.selected(),[ranked[0],ranked[6],...ranked.slice(3,6)]);
  assert.equal(fill(2).length,8);
  assert.equal(fill(6).length,12);
  assert.equal(new Set(deck.selected()).size,11);
  fill(1);
  for(const index of [0,2,3,4])deck.toggle(index);
  assert.deepEqual(deck.selected(),[ranked[5]]);
  assert.deepEqual(deck.fill('2/easy',['水','茶'],2).map(card=>card.text),['水','茶']);
  assert.equal(deck.canReroll(),false);
});

test('catalog requests carry every selected target and enforce the same focus budget',()=>{
  const request={band:1,difficulty:'easy',type:'book',chapterCount:1};
  const plan=catalogPlan({...request,characters:['你','我']});
  assert.deepEqual(plan.catalogTargets,['你','我']);
  assert.deepEqual(plan.newCharacters,plan.catalogTargets);
  assert.deepEqual(catalogPlan({...request,character:'你'}).catalogTargets,['你']);
  for(const characters of [[],['你','你'],['你','我','好'],['invalid']])
    assert.throws(()=>catalogPlan({...request,characters}));
  assert.equal(catalogPlan({...request,chapterCount:2,characters:['你','我','好']}).catalogTargets?.length,3);
});
