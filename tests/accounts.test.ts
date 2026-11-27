import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { testPool } from './postgres-fixture.ts';
import { createApp } from '../src/server.ts';

test('accounts keep separate bookmarks and can resume on a second browser',async t=>{
  const pool=await testPool();
  const server=await createApp(pool);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();
  assert(address && typeof address==='object');
  const base='http://127.0.0.1:'+address.port;
  const post=(path:string,value:unknown,cookie='')=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(value)});
  const signin=async(path:string,username:string,password:string)=>{
    const response=await post(path,{username,password});
    assert.equal(response.status,200);
    return response.headers.get('set-cookie')!.split(';')[0];
  };
  const tim=await signin('/api/register','Tim','first-password');
  assert.equal((await post('/api/stories/tea-shop/position',{chapter:0,paragraph:1},tim)).status,200);
  const another=await signin('/api/register','Other','other-password');
  const position=async(cookie:string)=>(await (await fetch(base+'/api/stories/tea-shop',{headers:{Cookie:cookie}})).json()).position;
  assert.deepEqual(await position(tim),{chapter:0,paragraph:1});
  assert.deepEqual(await position(another),{chapter:0,paragraph:0});
  assert.equal((await post('/api/stories/tea-shop/position',{chapter:1,paragraph:0},another)).status,200);
  assert.deepEqual(await position(await signin('/api/login','tim','first-password')),{chapter:0,paragraph:1});
  assert.equal((await post('/api/register',{username:'TIM',password:'other-password'})).status,409);
  assert.equal((await post('/api/login',{username:'Tim',password:'incorrect-password'})).status,401);
  assert.equal((await post('/api/logout',{},tim)).status,200);
  assert.equal((await fetch(base+'/api/stories',{headers:{Cookie:tim}})).status,401);
});
