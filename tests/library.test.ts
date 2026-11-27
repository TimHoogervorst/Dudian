import { testStore } from './postgres-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.ts';
test('a new learner browses gray Library items and can follow word–character links offline', async t => {
  const store = await testStore();
  const server = await createApp(store.db.pool);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));

  });
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const list = await store.fetch(base + '/api/library?kind=word&level=1');
  assert.equal(list.status, 200);
  const {items,total} = await list.json();
  assert.equal(total,67);
  assert(items.every((item:{text:string})=>Array.from(item.text).length>1));
  assert(items.every((item: {color:string}) => item.color === 'gray'));
  for (const size of [20,50,100,200]) {
    const result = await (await store.fetch(base + '/api/library?kind=word&level=1&pageSize='+size)).json();
    assert.equal(result.items.length,Math.min(size,total));
    assert.equal(result.pages,Math.ceil(total/size));
  }
  for (const q of ['明天','míngtiān','ming2 tian1','tomorrow']) {
    const params = new URLSearchParams({kind:'word',level:'1',q,pageSize:'20'});
    const results = await (await store.fetch(base+'/api/library?'+params)).json();
    assert(results.items.some((word:{text:string})=>word.text==='明天'),q);
  }
  const url = new URL('/api/library', base);
  url.search = new URLSearchParams({kind:'word',text:'银行'}).toString();
  const bank = await (await store.fetch(url)).json();
  assert.equal(bank.components[1].pinyin, 'háng');
  url.search = new URLSearchParams({kind:'character',text:bank.components[1].text}).toString();
  const character = await (await store.fetch(url)).json();
  const example = character.examples.find((x:{text:string}) => x.text === '银行');
  assert.ok(example);
  assert.equal(example.meaning,bank.senses[0].meaning);
  assert.equal(example.sense,bank.senses[0].id);
  const update=(kind:string,color:string)=>store.fetch(base+'/api/library?'+new URLSearchParams({kind,text:'茶'}),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({color})
  });
  for(const color of ['red','yellow','green','gold','gray']){
    assert.equal((await (await update('character',color)).json()).color,color);
    const filtered=await (await store.fetch(base+'/api/library?kind=character&level=1&status='+color+'&q=茶&pageSize=20')).json();
    assert.equal(filtered.total,1);
    assert.equal(filtered.items[0].color,color);
    assert.equal(filtered.items[0].text,'茶');
    const word=await (await store.fetch(base+'/api/library?kind=word&text=茶')).json();
    assert.equal(word.color,color);
    if(color==='gold')assert.equal(word.score,36);
  }
  assert.equal((await update('word','invalid')).status,400);
  assert.equal((await (await update('word','green')).json()).color,'green');
  const love=await (await store.fetch(base+'/api/library?kind=character&text=爱')).json();
  assert(love.senses.some((s:{meaning:string})=>s.meaning.includes('love')));
  assert(love.examples.every((w:{text:string})=>w.text!=='爱'));
  const search=await (await store.fetch(base+'/api/library?kind=word&level=1&q=爱')).json();
  assert(search.items.every((w:{text:string})=>w.text!=='爱'));
});
