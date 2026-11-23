import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/catalog.ts';

test('each curriculum level is browsable offline and characters start at their earliest word level', () => {
  assert.equal(catalog.list('word', 1).length, 150);
  assert.deepEqual([1,2,3,4,5,6].map(level => catalog.list('word', level).length), [150,147,298,598,1298,2500]);
  assert(catalog.list('word', 1).some(row => row.text === '学生'));
  assert(catalog.list('character', 1).some(row => row.text === '学'));
  assert(!catalog.list('character', 2).some(row => row.text === '学'));
});

test('a compound links to its characters with their contextual readings and back to the word', () => {
  const bank = catalog.get('word', '银行')!;
  assert(bank.senses.some(s => s.meaning === 'bank' && s.pinyin === 'yín háng' && s.id));
  assert.deepEqual(bank.components, [{text:'银',pinyin:'yín'},{text:'行',pinyin:'háng'}]);
  const character = catalog.get('character', '行')!;
  assert(character.senses.some(s => s.pinyin === 'xíng'));
  assert(character.examples.some(word => word.text === '银行'));
  assert.equal(character.examples[0].level, character.level);
  assert(catalog.get('word','打篮球')!.senses.some(s => s.meaning === 'to play basketball'));
  const things = catalog.get('word','东西')!;
  const thing = things.senses.find(s => s.meaning === 'thing')!;
  assert.equal(catalog.get('word','东西',thing.id)!.components[1].pinyin,'xi');
});
