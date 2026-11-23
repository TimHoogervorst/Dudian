import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {ReadingStore} from '../src/store.ts';
import {createApp} from '../src/server.ts';
import {artSettings,queueArtwork,setArtSettings} from '../src/cover-art.ts';
import {recordAction} from '../src/word-actions.ts';
import {finishChapter} from '../src/completion.ts';
import {strengthFor} from '../src/strength.ts';

function fixture(){
  const store=new ReadingStore();
  const cast={text:'包包',cast:'baobao' as const,pinyin:'Bāobāo',meaning:'Our steamed-bun friend'};
  store.saveStory({id:'rain',title:'First rain',cover:{teaser:'包包来了。',prompt:'Draw 包包 in the rain.'},
    chapters:[{title:'Rain',paragraphs:[[cast,{text:'来'},{text:'了'},{text:'。'}]]}]});
  return store;
}
test('subscription retries never invoke the paid provider, including with a saved API key',async()=>{
  const store=fixture();
  setArtSettings(store,{provider:'subscription',enabled:true,key:'old-paid-key'});
  let images=0;
  const paid=async()=>{throw Error('Paid provider was invoked');};
  queueArtwork(store,'rain',paid,async()=>{throw Error('Subscription limit reached');});
  await nextTurn();
  assert.equal(store.db.prepare('SELECT error FROM story_art').get()?.error,'Subscription limit reached');
  const draw=async(prompt:string,reference:Buffer)=>{
    assert.equal(prompt,'Draw 包包 in the rain.');images++;
    return reference;
  };
  queueArtwork(store,'rain',paid,draw);
  queueArtwork(store,'rain',paid,draw);
  await nextTurn();
  assert.equal(images,1);
  assert.equal(store.db.prepare('SELECT status FROM story_art').get()?.status,'ready');
  store.db.close();
});
test('a cast lookup or difficulty mark and chapter completion give no vocabulary credit for the name',()=>{
  const store=fixture();
  for(const kind of ['lookup','difficulty'] as const){
    const result=recordAction(store,{storyId:'rain',chapter:0,paragraph:0,token:0,id:kind,kind});
    assert.equal(result.pinyin,'Bāobāo');
  }
  finishChapter(store,'rain',0);
  assert.equal(strengthFor(store.db,'word','包包').score,null);
  assert.equal(strengthFor(store.db,'character','包').score,null);
  assert.equal(strengthFor(store.db,'word','来').score,1);
  store.db.close();
});

test('cover defaults, API key privacy, edits, failures, retries and manual import survive competing work',async t=>{
  const store=fixture();
  const server=await createApp(store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.close();store.db.close();});
  const address=server.address();
  assert.ok(address && typeof address==='object');
  const base='http://127.0.0.1:'+address.port;
  const path=base+'/api/stories/rain/art/';
  assert.deepEqual(artSettings(store),{enabled:true,configured:false,provider:'subscription',apiModel:'gpt-image-2.5-sunburst',codexModel:''});
  const fallback=Buffer.from(await (await fetch(path+'image')).arrayBuffer());
  assert.ok(fallback.length>100);
  setArtSettings(store,{provider:'api',enabled:false});
  assert.equal((await fetch(path+'retry',{method:'POST'})).status,409);
  setArtSettings(store,{provider:'api',enabled:true,key:'test-only',apiModel:'gpt-image-2.6-flare'});
  const settings=await (await fetch(base+'/api/art-settings')).json();
  assert.equal(settings.provider,'api');
  assert.equal(settings.configured,true);
  assert.ok(!('key' in settings));
  queueArtwork(store,'rain',async()=>new Response(null,{status:403}));
  await nextTurn();
  assert.equal((await (await fetch(path+'status')).json()).status,'failed');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=','base64');
  let finish!:(value:Response)=>void;
  const waiting=new Promise<Response>(resolve=>{finish=resolve;});
  queueArtwork(store,'rain',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/images/edits');
    const form=options?.body;
    assert.ok(form instanceof FormData);
    assert.equal(form.get('model'),'gpt-image-2.6-flare');
    assert.equal(form.get('prompt'),'Draw 包包 in the rain.');
    assert.ok(form.get('image[]') instanceof Blob);
    return waiting;
  });
  await nextTurn();
  assert.equal((await (await fetch(path+'status')).json()).status,'drawing');
  assert.equal((await fetch(path+'image',{method:'POST',body:png})).status,200);
  finish(Response.json({data:[{b64_json:fallback.toString('base64')}]}));
  await nextTurn();
  assert.equal((await (await fetch(path+'status')).json()).status,'imported');
  assert.deepEqual(Buffer.from(await (await fetch(path+'image')).arrayBuffer()),png);
});
