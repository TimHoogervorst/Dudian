import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {testStore} from './postgres-fixture.ts';
import {createAdmin} from '../src/admin/server.ts';
import {createApp} from '../src/server.ts';
import {insights} from '../src/admin/insights.ts';
import {initializeDatabase} from '../src/postgres/database.ts';
import {catalogPlan} from '../src/admin/jobs.ts';

test('population counts, score denominators and personal catalog coverage',async()=>{
  const first=await testStore(),pool=first.db.pool,second=await testStore(pool);
  const now=Date.now();
  for(const s of [first,second]){
    await s.db.prepare("INSERT INTO reading_advances(story_id,chapter,at) VALUES('tea-shop',0,$1)").run(now);
    await s.db.prepare("INSERT INTO reading_strength(kind,text,score) VALUES('character','你',$1)").run(s===first?2:4);
  }
  await testStore(pool);
  await first.saveStory({id:'sample',title:'You',difficulty:'easy',targetBand:1,preview:{characters:[{text:'你'}],review:[]},chapters:[]});
  await first.db.prepare("INSERT INTO hidden_stories(story_id) VALUES('sample')").run();
  const result=await insights(pool,now);
  assert.equal(result.all.count,3);assert.equal(result.active.count,2);assert.equal(result.active.levels[0],2);
  const char=result.characters.find(c=>c.text==='你')!;
  assert.equal(char.scored,2);assert.equal(char.average,3);assert.equal(char.stories,1);
  const suggested=result.suggestions.find(s=>s.character==='你')!;
  assert.deepEqual([suggested.total,suggested.review,suggested.first],[1,1,0]);
  assert.equal((await insights(pool,now+31*86400000)).active.count,0);
});

test('private manual generation publishes the verified focus and preserves reader isolation',async t=>{
  const store=await testStore(),pool=store.db.pool;
  await pool.query('UPDATE art_settings SET enabled=0');
  const reader=await createApp(pool);
  const sentence=['你:1','。'];
  const draft={title:'People',teaser:sentence,chapters:[{title:'People',paragraphs:Array.from({length:4},()=>[sentence]),translations:Array(4).fill('It is you.')}]};
  const bilingual=(word:string,en:string)=>({zh:[word],en});
  const question={prompt:bilingual('你','You?'),choices:[bilingual('你','You'),bilingual('我','Me'),bilingual('是','Yes')],correct:0,paragraph:0,token:0,word:'你',characters:['你']};
  let failWriting=false;
  const admin=await createAdmin(pool,'operator','test-password',async prompt=>{
    if(failWriting)throw Error('Writer unavailable');
    return JSON.stringify(prompt.startsWith('Write a chapter comprehension')?{questions:[question]}:draft);
  });
  for(const server of [reader,admin]){server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());}
  const base=(server:typeof reader)=>'http://127.0.0.1:'+(server.address() as {port:number}).port;
  assert.equal((await store.fetch(base(reader)+'/api/generate-story',{method:'POST',body:'{}'})).status,404);
  assert.equal((await store.fetch(base(reader)+'/api/insights')).status,404);
  assert.equal((await store.fetch(base(admin)+'/api/users')).status,401);
  const post=(path:string,input:unknown,token='')=>fetch(base(admin)+path,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(input)});
  const {token}=await (await post('/api/login',{username:'operator',password:'test-password'})).json();
  const request={id:randomUUID(),character:'好',band:1,difficulty:'easy',chapterCount:1,type:'book'};
  assert.equal((await post('/api/jobs',request,token)).status,202);
  assert.equal((await post('/api/jobs',request,token)).status,202);
  assert.equal((await post('/api/jobs',{...request,character:'你'},token)).status,409);
  let job;
  for(let i=0;i<100;i++){
    [job]=(await pool.query('SELECT * FROM catalog_jobs')).rows;
    if(['published','failed'].includes(job.stage))break;
    await delay(100);
  }
  assert.equal(job.stage,'published',job.error);
  const results=await fetch(base(admin)+'/api/jobs',{headers:{Authorization:'Bearer '+token}});
  assert.equal(results.status,200);
  const [published]=await results.json();
  assert.equal(published.request.character,'好');
  assert.deepEqual(published.focus.map(item=>item.text),['你']);
  const story=await store.story(job.story_id);
  assert.deepEqual(story.preview?.characters.map(c=>c.text),['你']);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM catalog_jobs')).rows[0].n,1);
  failWriting=true;
  const failedId=randomUUID();
  await post('/api/jobs',{...request,id:failedId},token);
  for(let i=0;i<100;i++){
    const {rows}=await pool.query('SELECT stage FROM catalog_jobs WHERE id=$1',[failedId]);
    if(rows[0]?.stage==='failed')break;
    await delay(100);
  }
  assert.deepEqual((await pool.query('SELECT stage,story_id FROM catalog_jobs WHERE id=$1',[failedId])).rows[0],{stage:'failed',story_id:null});
  assert.equal((await store.stories()).length,2);
  assert.throws(()=>catalogPlan({...request,band:0}));
  await post('/api/logout',{},token);
  assert.equal((await fetch(base(admin)+'/api/users',{headers:{Authorization:'Bearer '+token}})).status,401);
});

test('the version-one upgrade preserves existing accounts, catalog and learning progress',async()=>{
  const store=await testStore(),pool=store.db.pool;
  await store.db.prepare("INSERT INTO reading_strength(kind,text,score) VALUES('character','你',4)").run();
  // Restore the earlier schema shape inside this test's disposable schema.
  await pool.query('DROP TABLE catalog_jobs');
  await pool.query('ALTER TABLE score_tracking DROP COLUMN last_milestone_practice');
  await pool.query('DELETE FROM dudian_schema_versions WHERE version=2');
  await Promise.all([initializeDatabase(pool),initializeDatabase(pool)]);
  assert.equal((await pool.query('SELECT max(version) AS version FROM dudian_schema_versions')).rows[0].version,2);
  const result=await insights(pool);
  assert.equal(result.all.count,1);
  assert.equal(result.characters.find(c=>c.text==='你')?.average,4);
  assert.ok(result.stories.some(s=>s.id==='tea-shop'));
  assert.equal((await pool.query('SELECT id FROM catalog_jobs')).rowCount,0);
});
