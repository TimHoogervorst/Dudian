import type { Context } from '../server.ts';
import { HttpError } from '../store.ts';
import { catalog } from '../catalog.ts';
import { strengthFor } from '../strength.ts';

export default function library({req,url,store,json}: Context) {
  if (url.pathname !== '/api/library' || req.method !== 'GET') return false;
  const kind = url.searchParams.get('kind') ?? 'character';
  if (kind !== 'word' && kind !== 'character') throw new HttpError(400, 'Choose Words or Characters.');
  const text = url.searchParams.get('text');
  if (text !== null) {
    const item = catalog.get(kind, text, url.searchParams.get('sense') ?? undefined);
    if (!item) throw new HttpError(404, 'Dictionary entry unavailable.');
    json(200,{...item,...strengthFor(store.db,kind,text)});
    return true;
  }

  const level = Number(url.searchParams.get('level') ?? 1);
  const page = Number(url.searchParams.get('page') ?? 1);
  if (!Number.isInteger(level) || level < 1 || level > 6) throw new HttpError(400,'Choose HSK 1 through 6.');
  if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400,'Choose a Library page.');
  const list = catalog.list(kind, level);
  const pageSize = 48;
  const items = list.slice((page-1)*pageSize,page*pageSize).map(item => {
    const first = catalog.get(kind,item.text)?.senses[0];
    return {...item,pinyin:first?.pinyin,meaning:first?.meaning,...strengthFor(store.db,kind,item.text)};
  });
  json(200,{items,total:list.length,page,pages:Math.ceil(list.length/pageSize)});
  return true;
}
