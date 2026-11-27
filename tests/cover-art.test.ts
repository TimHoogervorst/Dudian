import { testStore } from './postgres-fixture.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { ReadingStore } from '../src/store.ts';
import { createApp } from '../src/server.ts';
import { artSettings,queueArtwork,setArtSettings } from '../src/cover-art.ts';
import { recordAction } from '../src/word-actions.ts';
import { finishChapter } from '../src/completion.ts';
import { strengthFor } from '../src/strength.ts';

async function waitForArt(store:ReadingStore,id:string,status:string) {
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){
    if((await store.db.prepare('SELECT status FROM story_art WHERE id=$1').get(id))?.status===status)return;
    await delay(10);
  }
  assert.fail('Cover did not reach '+status);
}
async function fixture(){
  const store=await testStore();
  const cast={text:'包包',cast:'baobao' as const,pinyin:'Bāobāo',meaning:'Our steamed-bun friend'};
  await store.saveStory({id:'rain',title:'First rain',cover:{teaser:'包包来了。',prompt:'Draw 包包 in the rain.'},
    chapters:[{title:'Rain',paragraphs:[[cast,{text:'来'},{text:'了'},{text:'。'}]]}]});
  return store;
}
test('subscription retries never invoke the paid provider, including with a saved API key',async()=>{
  const store=await fixture();
  await setArtSettings(store,{provider:'subscription',enabled:true,key:'old-paid-key'});
  let images=0;
  const paid=async()=>{throw Error('Paid provider was invoked');};
  await queueArtwork(store,'rain',paid,async()=>{throw Error('Subscription limit reached');});
  await waitForArt(store,'rain','failed');
  assert.equal((await store.db.prepare('SELECT error FROM story_art').get())?.error,'Subscription limit reached');
  const draw=async(prompt:string,reference:Buffer|undefined)=>{
    assert.ok(reference);
    assert.equal(prompt,'Draw 包包 in the rain.');images++;
    return reference;
  };
  await queueArtwork(store,'rain',paid,draw);
  await queueArtwork(store,'rain',paid,draw);
  await waitForArt(store,'rain','ready');
  assert.equal(images,1);
  assert.equal((await store.db.prepare('SELECT status FROM story_art').get())?.status,'ready');

});
test('a cast lookup or difficulty mark and chapter completion give no vocabulary credit for the name',async ()=>{
  const store=await fixture();
  for(const kind of ['lookup','difficulty'] as const){
    const result=await recordAction(store,{storyId:'rain',chapter:0,paragraph:0,token:0,id:kind,kind});
    assert.equal(result.pinyin,'Bāobāo');
  }
  await finishChapter(store,'rain',0);
  assert.equal((await strengthFor(store.db,'word','包包')).score,null);
  assert.equal((await strengthFor(store.db,'character','包')).score,null);
  assert.equal((await strengthFor(store.db,'word','来')).score,0.25);

});

test('cover defaults, API key privacy, edits, failures, retries and manual import survive competing work',async t=>{
  const store=await fixture();
  const server=await createApp(store.db.pool);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.close();});
  const address=server.address();
  assert.ok(address && typeof address==='object');
  const base='http://127.0.0.1:'+address.port;
  const path=base+'/api/stories/rain/art/';
  assert.deepEqual(await artSettings(store),{enabled:true,configured:false,provider:'subscription',apiModel:'gpt-image-2.5-sunburst',codexModel:''});
  const fallback=Buffer.from(await (await store.fetch(path+'image')).arrayBuffer());
  assert.ok(fallback.length>100);
  await setArtSettings(store,{provider:'api',enabled:false});
  assert.equal((await store.fetch(path+'retry',{method:'POST'})).status,409);
  await setArtSettings(store,{provider:'api',enabled:true,key:'test-only',apiModel:'gpt-image-2.6-flare'});
  const settings=await (await store.fetch(base+'/api/art-settings')).json();
  assert.equal(settings.provider,'api');
  assert.equal(settings.configured,true);
  assert.ok(!('key' in settings));
  await queueArtwork(store,'rain',async()=>new Response(null,{status:403}));
  await waitForArt(store,'rain','failed');
  assert.equal((await (await store.fetch(path+'status')).json()).status,'failed');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=','base64');
  let finish!:(value:Response)=>void;
  const waiting=new Promise<Response>(resolve=>{finish=resolve;});
  await queueArtwork(store,'rain',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/images/edits');
    const form=options?.body;
    assert.ok(form instanceof FormData);
    assert.equal(form.get('model'),'gpt-image-2.6-flare');
    assert.equal(form.get('prompt'),'Draw 包包 in the rain.');
    assert.ok(form.get('image[]') instanceof Blob);
    return waiting;
  });
  await waitForArt(store,'rain','drawing');
  assert.equal((await (await store.fetch(path+'status')).json()).status,'drawing');
  assert.equal((await store.fetch(path+'image',{method:'POST',body:png})).status,200);
  finish(Response.json({data:[{b64_json:fallback.toString('base64')}]}));
  await waitForArt(store,'rain','imported');
  assert.equal((await (await store.fetch(path+'status')).json()).status,'imported');
  assert.deepEqual(Buffer.from(await (await store.fetch(path+'image')).arrayBuffer()),png);
});

test('artwork for a document uses its prompt without a character portrait',async t=>{
  const store=await fixture();

  const story=await store.story('rain');
  await store.saveStory({...story,id:'notice',cover:{teaser:'下雨了。',prompt:'A station notice',reference:false}});
  await setArtSettings(store,{provider:'api',enabled:true,key:'test'});
  await queueArtwork(store,'notice',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/images/generations');
    assert.equal(JSON.parse(String(options?.body)).prompt,'A station notice');
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=';
    return Response.json({data:[{b64_json:png}]});
  });
  await waitForArt(store,'notice','ready');
  assert.equal((await store.db.prepare("SELECT status FROM story_art WHERE id='notice'").get())?.status,'ready');
});

test('saved baby books featuring Bāobāo use the standalone template on retry',async t=>{
  const store=await fixture();

  const old=await store.story('rain');
  await store.saveStory({...old,id:'baby',format:{type:'book',stage:'Baby book'},
    cover:{...old.cover!,reference:true,prompt:'Match 包包 in the supplied reference.'}});
  await setArtSettings(store,{provider:'subscription',enabled:true});
  let called=false;
  await queueArtwork(store,'baby',undefined,async(prompt,reference)=>{
    called=true;
    assert.ok(reference===undefined,'expected a portrait-free job');
    assert.doesNotMatch(prompt,/supplied reference/);
    assert.match(prompt,/gouache/);
    throw Error('fixture complete');
  });
  await waitForArt(store,'baby','failed');
  assert.ok(called);
  assert.equal((await store.db.prepare("SELECT error FROM story_art WHERE id='baby'").get())?.error,'fixture complete');
});
