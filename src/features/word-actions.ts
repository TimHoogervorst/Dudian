import type { Context } from '../server.ts';
import { HttpError } from '../store.ts';
import { recordAction,usageHistory } from '../word-actions.ts';

export default async function readerActions({req,url,store,json,body}:Context) {
  if (url.pathname==='/api/word-action' && req.method==='POST') {
    json(200,await recordAction(store,await body()));
  } else if(url.pathname==='/api/cover-marks' && req.method==='GET'){

    json(200,(await store.db.prepare("SELECT DISTINCT token FROM word_actions WHERE story_id=$1 AND chapter=-1 AND kind='difficulty'").all(url.searchParams.get('story'))).map(r=>Number(r.token)));
  } else if (url.pathname==='/api/reader-preferences' && ['GET','POST'].includes(req.method??'')) {

    if(req.method==='POST') {
      const value=await body();
      if(typeof value?.pinyin!=='boolean')throw new HttpError(400,'Choose whether to show pinyin.');
      await store.db.prepare('UPDATE reader_preferences SET pinyin=$1 WHERE id=1').run(Number(value.pinyin));
    }
    json(200,{pinyin:Boolean((await store.db.prepare('SELECT pinyin FROM reader_preferences WHERE id=1').get())?.pinyin)});
  } else if(url.pathname==='/api/usage-history' && req.method==='GET') {
    const char=url.searchParams.get('character')??'';
    if(Array.from(char).length!==1)throw new HttpError(400,'Choose one character.');
    json(200,await usageHistory(store,char));
  } else return false;
  return true;
}
