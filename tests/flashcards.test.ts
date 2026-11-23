import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadingStore} from '../src/store.ts';
import {startSession,gradeCard,readSession} from '../src/flashcards.ts';
import {strengthFor} from '../src/strength.ts';
import {catalog} from '../src/catalog.ts';

test('a fresh learner can open either deck or review only a particular compound', t => {
  const store = new ReadingStore();
  t.after(()=>store.db.close());
  for (const kind of ['character','word'] as const) {
    const deck = startSession(store.db,{kind,level:1});
    assert.equal(deck.total,10);
    assert.equal(deck.kind,kind);
    assert(deck.card?.senses[0].pinyin);
  }
  const exact = startSession(store.db,{kind:'word',words:['银行','银行']});
  assert.equal(exact.total,1);
  assert.equal(exact.card?.text,'银行');
  assert(exact.card?.senses.some(s => s.meaning==='bank'));
});

test('grading is idempotent and affects only the reviewed item, with extra credit for later recall', t => {
  const store = new ReadingStore();
  t.after(()=>store.db.close());
  const review = (word:string,grade:string,at:number) => {
    const deck = startSession(store.db,{kind:'word',words:[word]});
    return gradeCard(store.db,deck.id,0,grade,at);
  };
  const day = Date.UTC(2026,1,1,12);
  const miss = review('银行','incorrect',day);
  assert.equal(miss.card,null);
  const initial = strengthFor(store.db,'word','银行');
  assert.equal(initial.color,'red');
  gradeCard(store.db,miss.id,0,'incorrect',day);
  assert.deepEqual(strengthFor(store.db,'word','银行'),initial);
  assert.equal(strengthFor(store.db,'character','银').color,'gray');
  review('学生','correct',day);
  assert.equal(strengthFor(store.db,'word','学生').color,'yellow');
  review('学生','correct',day+86400000);
  assert.equal(strengthFor(store.db,'word','学生').color,'green');
  review('学生','incorrect',day+86400010);
  assert.equal(strengthFor(store.db,'word','学生').color,'yellow');
  const deck = startSession(store.db,{kind:'word',level:catalog.get('word','银行')!.level!});
  const shown: string[] = [];
  for (let i=0;i<deck.total;i++) {
    shown.push(readSession(store.db,deck.id).card!.text);
    gradeCard(store.db,deck.id,i,'almost',day);
  }
  assert(shown.includes('银行'));
});
