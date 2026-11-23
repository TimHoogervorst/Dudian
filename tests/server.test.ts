import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/server.ts';
import {ReadingStore} from '../src/store.ts';

test('browsers share resume state through the reader API', async () => {
  const store = new ReadingStore();
  const server = await createApp(store);
  server.listen(0,'127.0.0.1');
  try {
    await once(server,'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    const read = () => fetch(base + '/api/stories/tea-shop').then(r=>r.json());
    const first = await read();
    assert.equal(first.story.chapters[0].title,'A cup of tea');
    const moved = await fetch(base+'/api/stories/tea-shop/position',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapter:0,paragraph:1})});
    assert.equal(moved.status,200);
    assert.deepEqual((await read()).position,{chapter:0,paragraph:1});
    const home = await fetch(base).then(r=>r.text());
    assert.match(home,/Dudian/);
  } finally { server.close(); store.db.close(); }
});
