import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server.ts';
import { ReadingStore } from '../src/store.ts';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startSession,gradeCard,flashcardHistory} from '../src/flashcards.ts';
import {strengthFor,setStrength} from '../src/strength.ts';

test('existing single-character scores and open flashcards converge on the character entry',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dudian-library-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'reader.sqlite');
  const old=new ReadingStore(file);
  setStrength(old.db,'character','爱','green');
  const session=startSession(old.db,{kind:'word',words:['爱','茶']});
  gradeCard(old.db,session.id,0,'correct');
  old.db.exec("UPDATE flashcard_reviews SET kind='word'; INSERT INTO reading_strength VALUES('word','爱',-3),('word','茶',4)");
  const loveScore=strengthFor(old.db,'character','爱').score;
  old.db.close();
  const store=new ReadingStore(file);
  try{
    assert.equal(strengthFor(store.db,'character','爱').score,loveScore);
    assert.equal(strengthFor(store.db,'character','茶').score,4);
    gradeCard(store.db,session.id,1,'incorrect');
    assert.equal(strengthFor(store.db,'character','茶').score,1);
    assert(flashcardHistory(store.db).every(review=>review.kind==='character'));
    assert.equal(store.db.prepare("SELECT count(*) n FROM reading_strength WHERE kind='word'").get()?.n,0);
  }finally{store.db.close();}
});

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
  assert.equal(total,67);
  assert(items.every((item:{text:string})=>Array.from(item.text).length>1));
  assert(items.every((item: {color:string}) => item.color === 'gray'));
  for (const size of [20,50,100,200]) {
    const result = await (await fetch(base + '/api/library?kind=word&level=1&pageSize='+size)).json();
    assert.equal(result.items.length,Math.min(size,total));
    assert.equal(result.pages,Math.ceil(total/size));
  }
  for (const q of ['明天','míngtiān','ming2 tian1','tomorrow']) {
    const params = new URLSearchParams({kind:'word',level:'1',q,pageSize:'20'});
    const results = await (await fetch(base+'/api/library?'+params)).json();
    assert(results.items.some((word:{text:string})=>word.text==='明天'),q);
  }
  const url = new URL('/api/library', base);
  url.search = new URLSearchParams({kind:'word',text:'银行'}).toString();
  const bank = await (await fetch(url)).json();
  assert.equal(bank.components[1].pinyin, 'háng');
  url.search = new URLSearchParams({kind:'character',text:bank.components[1].text}).toString();
  const character = await (await fetch(url)).json();
  const example = character.examples.find((x:{text:string}) => x.text === '银行');
  assert.ok(example);
  assert.equal(example.meaning,bank.senses[0].meaning);
  assert.equal(example.sense,bank.senses[0].id);
  const update=(kind:string,color:string)=>fetch(base+'/api/library?'+new URLSearchParams({kind,text:'茶'}),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({color})
  });
  for(const color of ['red','yellow','green','gray']){
    assert.equal((await (await update('character',color)).json()).color,color);
    const filtered=await (await fetch(base+'/api/library?kind=character&level=1&status='+color+'&q=茶&pageSize=20')).json();
    assert.equal(filtered.total,1);
    assert.equal(filtered.items[0].color,color);
    assert.equal(filtered.items[0].text,'茶');
    const word=await (await fetch(base+'/api/library?kind=word&text=茶')).json();
    assert.equal(word.color,color);
  }
  assert.equal((await update('word','invalid')).status,400);
  assert.equal((await (await update('word','green')).json()).color,'green');
  const love=await (await fetch(base+'/api/library?kind=character&text=爱')).json();
  assert(love.senses.some((s:{meaning:string})=>s.meaning.includes('love')));
  assert(love.examples.every((w:{text:string})=>w.text!=='爱'));
  const search=await (await fetch(base+'/api/library?kind=word&level=1&q=爱')).json();
  assert(search.items.every((w:{text:string})=>w.text!=='爱'));
});
