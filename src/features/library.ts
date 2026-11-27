import type { Context } from '../server.ts';
import { HttpError } from '../store.ts';
import { catalog,entryKind,type CatalogItem,type Sense } from '../catalog.ts';
import { setStrength,statusScores,strengthFor,strength,recordedStrengths } from '../strength.ts';
import { encounterFor } from '../encounters.ts';

function plainPinyin(text: string) {
  return text.toLowerCase().replace(/u:|v/g,'ü').normalize('NFD')
    .replace(/[\u0300\u0301\u0304\u030c]/g,'').replace(/[1-5\s'’\-]/g,'').normalize('NFC');
}

export default async function library({req,url,store,json,body}: Context) {
  if (url.pathname !== '/api/library' || !['GET','POST'].includes(req.method??'')) return false;
  const kind = url.searchParams.get('kind') ?? 'character';
  if (kind !== 'word' && kind !== 'character') throw new HttpError(400, 'Choose Words or Characters.');
  const text = url.searchParams.get('text');
  if(req.method==='POST'){
    if(!text || !catalog.get(kind,text))throw new HttpError(404,'Dictionary entry unavailable.');
    const color=(await body())?.color;
    if(typeof color!=='string'||!Object.hasOwn(statusScores,color))throw new HttpError(400,'Choose a reading status.');
    const strength=await setStrength(store.db,kind,text,color as keyof typeof statusScores);
    json(200,{...strength,lastSeen:(await encounterFor(store.db,text)).lastSeen});
    return true;
  }
  if (text !== null) {
    const primary=catalog.studySense(text);
    const item = catalog.get(entryKind(kind,text), text, url.searchParams.get('sense') ?? primary?.id);
    if (!item) throw new HttpError(404, 'Dictionary entry unavailable.');
    const examples = item.examples.map(word => {
      const firstSense = catalog.studySense(word.text);
      return {...word,meaning:firstSense?.meaning,sense:firstSense?.id};
    });
    json(200,{...item,primarySense:primary?.id,examples,...await strengthFor(store.db,kind,text),lastSeen:(await encounterFor(store.db,text)).lastSeen});
    return true;
  }

  const level = Number(url.searchParams.get('level') ?? 1);
  const requestedPage = Number(url.searchParams.get('page') ?? 1);
  if (!Number.isInteger(level) || level < 1 || level > 6) throw new HttpError(400,'Choose HSK 1 through 6.');
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new HttpError(400,'Choose a Library page.');
  const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
  if (![20,50,100,200].includes(pageSize)) throw new HttpError(400,'Choose 20, 50, 100, or 200 entries per page.');
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const sound = plainPinyin(query);
  const color=url.searchParams.get('status');
  if(color && !Object.hasOwn(statusScores,color))throw new HttpError(400,'Choose a reading status.');
  const levelItems=catalog.libraryItems(kind,level);
  const scores=new Map((await recordedStrengths(store.db)).map(item=>[item.text,item.score]));
  const current=(text:string)=>strength(scores.get(text)??null);
  const list=color?levelItems.filter(item=>current(item.text).color===color):levelItems;
  const matches: (CatalogItem & {match?:Sense})[] = query ? list.flatMap(item => {
    const senses = catalog.get(kind,item.text)?.senses ?? [];
    const primary=catalog.studySense(item.text);
    const matchesQuery=(s:Sense)=>s.meaning.toLowerCase().includes(query)||Boolean(sound&&plainPinyin(s.pinyin).includes(sound));
    const sense = item.text.includes(query)||(primary&&matchesQuery(primary)) ? primary : senses.find(matchesQuery);
    return sense ? [{...item,match:sense}] : [];
  }) : list;
  const pages = Math.max(1,Math.ceil(matches.length/pageSize));
  const page = Math.min(pages,requestedPage);
  const items = matches.slice((page-1)*pageSize,page*pageSize).map( ({match,...item}) => {
    const first = match ?? catalog.studySense(item.text);
    return {...item,pinyin:first?.pinyin,meaning:first?.meaning,sense:match?.id,...current(item.text)};
  });
  json(200,{items,total:matches.length,page,pages});
  return true;
}
