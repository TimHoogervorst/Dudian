import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadingStore } from '../src/store.ts';

test('a second store for the account resumes its saved paragraph', async () => {
  const store=await testStore();
  const story=await store.story('tea-shop');
  assert.equal(story.title,'At the tea shop');
  await store.move(story.id,0,1);
  const reopened=new ReadingStore(store.db);
  assert.deepEqual(await reopened.position(story.id),{chapter:0,paragraph:1});
  assert.deepEqual(await reopened.story(story.id),story);
  await assert.rejects(reopened.move(story.id,0,10000));
});
