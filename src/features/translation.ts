import type {Context} from '../server.ts';
import {paragraphTranslation} from '../paragraph-translation.ts';

export default async function translation({url,req,body,json,store}:Context){
  const match=url.pathname.match(/^\/api\/stories\/([^/]+)\/translation$/);
  if(!match || req.method!=='POST')return false;
  const {chapter,paragraph}=await body();
  json(200,{translation:await paragraphTranslation(store,decodeURIComponent(match[1]),chapter,paragraph)});
  return true;
}
