import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.ts';
import { ReadingStore } from '../src/store.ts';

test('a new learner browses gray Library items and can follow word–character links offline', async t => {
  const store = new ReadingStore();
  const server = await createApp(store);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    store.db.close();
  });
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const list = await fetch(base + '/api/library?kind=word&level=1');
  assert.equal(list.status, 200);
  const {items,total} = await list.json();
  assert.equal(total, 150);
  assert(items.every((item: {color:string}) => item.color === 'gray'));
  const url = new URL('/api/library', base);
  url.search = new URLSearchParams({kind:'word',text:'银行'}).toString();
  const bank = await (await fetch(url)).json();
  assert.equal(bank.components[1].pinyin, 'háng');
  url.search = new URLSearchParams({kind:'character',text:bank.components[1].text}).toString();
  const character = await (await fetch(url)).json();
  assert(character.examples.some((x:{text:string}) => x.text === '银行'));
});
