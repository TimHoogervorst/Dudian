import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReadingStore } from '../src/store.ts';

test('a second reader resumes the seeded chapter at the saved paragraph after restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'street-talk-'));
  try {
    const filename = join(dir, 'reader.sqlite');
    let store = new ReadingStore(filename);
    const story = store.story('tea-shop');
    assert.equal(story.title, 'At the tea shop');
    assert.ok(story.chapters[0].paragraphs.length >= 2);
    store.move(story.id, 0, 1);
    store.db.close();
    store = new ReadingStore(filename);
    assert.deepEqual(store.position(story.id), { chapter: 0, paragraph: 1 });
    assert.deepEqual(store.story(story.id), story);
    assert.throws(() => store.move(story.id, 0, 10000));
    store.db.close();
  } finally {
    rmSync(dir, {recursive:true, force:true});
  }
});

