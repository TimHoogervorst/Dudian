import {readFileSync} from 'node:fs';
import {HttpError,type ReadingStore} from './store.ts';
import {subscriptionCover} from './subscription-art.ts';

export const imageLimit=12*1024*1024;
export const imageModels=['gpt-image-2.5-sunburst','gpt-image-2.5-flare','gpt-image-2.6-sunburst','gpt-image-2.6-flare','gpt-image-2'];
export function ensureArt(store:ReadingStore) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS art_settings(id INTEGER PRIMARY KEY, enabled INTEGER DEFAULT 0, key TEXT DEFAULT '', portrait BLOB);
    INSERT OR IGNORE INTO art_settings(id,enabled) VALUES(1,1);
    CREATE TABLE IF NOT EXISTS art_provider(id INTEGER PRIMARY KEY, provider TEXT NOT NULL);
    INSERT OR IGNORE INTO art_provider VALUES(1,'subscription');
    CREATE TABLE IF NOT EXISTS cover_models(id INTEGER PRIMARY KEY,apiModel TEXT NOT NULL,codexModel TEXT NOT NULL);
    INSERT OR IGNORE INTO cover_models VALUES(1,'gpt-image-2.5-sunburst','');
    CREATE TABLE IF NOT EXISTS story_art(id TEXT PRIMARY KEY REFERENCES stories(id), status TEXT NOT NULL, image BLOB, error TEXT);`);
}
export function artSettings(store:ReadingStore) {
  ensureArt(store);
  const row=store.db.prepare("SELECT enabled,key<>'' AS configured FROM art_settings WHERE id=1").get()!;
  const provider=String(store.db.prepare('SELECT provider FROM art_provider WHERE id=1').get()!.provider);
  const models=store.db.prepare('SELECT apiModel,codexModel FROM cover_models WHERE id=1').get()!;
  return {enabled:!!row.enabled,configured:!!row.configured,provider,apiModel:String(models.apiModel),codexModel:String(models.codexModel)};
}
export function setArtSettings(store:ReadingStore,input:any) {
  const current=artSettings(store);
  if(typeof input?.enabled!=='boolean'||(input.key!==undefined && (typeof input.key!=='string'||input.key.length>1024)))
    throw new HttpError(400,'Choose an artwork setting.');
  const key=input.key?.trim();
  const provider=input.provider??current.provider;
  const apiModel=input.apiModel??current.apiModel,codexModel=input.codexModel??current.codexModel;
  if(!imageModels.includes(apiModel)||typeof codexModel!=='string'||(codexModel&&!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(codexModel)))throw new HttpError(400,'Choose a supported cover model.');
  if(provider!=='subscription' && provider!=='api')throw new HttpError(400,'Choose an artwork provider.');
  if(provider==='api' && input.enabled && !key && !current.configured)throw new HttpError(400,'Enter an image API key to enable paid API covers.');
  store.db.prepare('UPDATE art_provider SET provider=? WHERE id=1').run(provider);
  store.db.prepare('UPDATE cover_models SET apiModel=?,codexModel=? WHERE id=1').run(apiModel,codexModel);
  store.db.prepare("UPDATE art_settings SET enabled=?,key=coalesce(?,key) WHERE id=1").run(Number(input.enabled),key||null);
  return artSettings(store);
}
export function imageType(bytes:Buffer) {
  if(bytes.length>imageLimit)throw new HttpError(413,'Choose an image smaller than 12 MB.');
  if(bytes.length>24 && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && bytes.toString('ascii',12,16)==='IHDR')return 'image/png';
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  throw new HttpError(400,'Choose a PNG, JPEG, or WebP image.');
}
export function portrait(store:ReadingStore) {
  const row=store.db.prepare('SELECT portrait FROM art_settings WHERE id=1').get();
  return row?.portrait instanceof Uint8Array?Buffer.from(row.portrait):readFileSync(new URL('../public/baobao.png',import.meta.url));
}
async function paidCover(key:string,model:string,prompt:string,bytes:Buffer,request:typeof fetch){
  const type=imageType(bytes);
  const form=new FormData();
  form.set('model',model);form.set('prompt',prompt);
  form.set('image[]',new Blob([new Uint8Array(bytes)],{type}),'baobao.'+type.split('/')[1]);
  const response=await request('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error('Image API returned HTTP '+response.status+'. Check the image key and API billing, then retry.');
  const result=await response.json();
  return Buffer.from(result.data?.[0]?.b64_json??'','base64');
}
export function queueArtwork(store:ReadingStore,id:string,request=fetch,subscription=subscriptionCover) {
  const settings=artSettings(store);
  if(settings.provider==='api' && !settings.enabled)throw new HttpError(409,'Enable paid API covers in Settings first.');
  const cover=store.story(id).cover;
  if(!cover)throw new HttpError(400,'This story has no illustration prompt.');
  const claim=store.db.prepare(`INSERT INTO story_art(id,status) VALUES(?,'drawing')
    ON CONFLICT(id) DO UPDATE SET status='drawing',error=NULL WHERE status='failed'`).run(id);
  if(!claim.changes)return;
  const key=String(store.db.prepare('SELECT key FROM art_settings WHERE id=1').get()!.key);
  setImmediate(async()=>{
    try{
      const bytes=portrait(store);
      const image=settings.provider==='subscription'?await subscription(cover.prompt,bytes,settings.codexModel):await paidCover(key,settings.apiModel,cover.prompt,bytes,request);
      imageType(image);
      store.db.prepare("UPDATE story_art SET image=?,status='ready' WHERE id=? AND status='drawing'").run(image,id);
    }catch(error){
      store.db.prepare("UPDATE story_art SET error=?,status='failed' WHERE id=? AND status='drawing'").run(error instanceof Error?error.message:'Illustration failed.',id);
    }
  });
}
