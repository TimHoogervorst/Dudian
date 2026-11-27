import { generateText } from './provider.ts';
import { HttpError,type ReadingStore } from './store.ts';

export function isTranslation(value:unknown):value is string{
  return typeof value==='string' && /[a-z]/i.test(value) && value.length<=12000;
}

const pending=new WeakMap<ReadingStore,Map<string,Promise<string>>>();

export async function paragraphTranslation(store:ReadingStore,id:string,chapter:number,paragraph:number,write=generateText){
  if(!Number.isInteger(chapter)||!Number.isInteger(paragraph))throw new HttpError(400,'Choose a paragraph in this story.');
  const requests=pending.get(store)??new Map<string,Promise<string>>();
  pending.set(store,requests);
  const key=JSON.stringify([id,chapter,paragraph]);
  const existing=requests.get(key);
  if(existing)return existing;
  const request=(async()=>{
    const section=(await store.story(id)).chapters[chapter];
    const tokens=section?.paragraphs[paragraph];
    if(!tokens)
      throw new HttpError(400,'Choose a paragraph in this story.');
    const cached=section.translations?.[paragraph];
    if(cached)return cached;
    const passage=section.paragraphs.map(p=>p.map(t=>t.text).join(''));
    const result=await write(JSON.stringify({chapter:section.title,paragraphs:passage,translateIndex:paragraph}),
      'Translate only the paragraph at the zero-based translateIndex into natural English. Use the chapter for context. Preserve names and dialogue. Return only its translation as plain English text.');
    if(!isTranslation(result))throw new HttpError(502,'No English translation was returned. Try again.');
    const english=result.trim();
    // Merge into the latest chapter so concurrent reveals of different paragraphs both persist.
    await store.db.transaction(async()=>{
      await store.db.prepare('SELECT id FROM stories WHERE id=$1 FOR UPDATE').get(id);
      const latest=(await store.story(id)).chapters[chapter];
      const translations=latest.translations??Array(latest.paragraphs.length).fill(null);
      translations[paragraph]=english;
      await store.db.prepare('UPDATE stories SET content=jsonb_set(content,$1::text[],$2::jsonb) WHERE id=$3')
        .run(['chapters',String(chapter),'translations'],JSON.stringify(translations),id);
    });
    return english;
  })();
  requests.set(key,request);
  try{return await request;}finally{requests.delete(key);}
}
