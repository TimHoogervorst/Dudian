import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ReadingStore, HttpError } from './store.ts';
import {readerChapters} from './chapter-check.ts';
import {strengthFor} from './strength.ts';
import {storyFocus} from './story-scoring.ts';
import type {PreviewItem} from './store.ts';
import {markAdvance} from './activity.ts';
import {prepareMilestones} from './milestone-test.ts';
import {initializeGeneration} from './generation-job.ts';

const root = fileURLToPath(new URL('../',import.meta.url));
const publicDir = join(root,'public');
function files(subdir: string) {
  const dir = join(root,subdir);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}
export interface Context {
  req: IncomingMessage; res: ServerResponse; url: URL; store: ReadingStore;
  json: (status: number,value: unknown)=>void; body: ()=>Promise<any>;
}
type Handler = (ctx: Context)=>Promise<boolean> | boolean;
const mime: Record<string,string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024*1024) throw new HttpError(413,'Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400,'Expected a JSON request.'); }
}
export async function createApp(store: ReadingStore) {
  initializeGeneration(store);
  const features: Handler[] = [];
  for (const file of files('src/features').filter(f=>f.endsWith('.ts'))) {
    const feature = await import(pathToFileURL(join(root,'src/features',file)).href);
    if (typeof feature.default === 'function') features.push(feature.default);
  }
  // Ordinary reader requests can change eligibility. Only rescan the curriculum
  // when a score change has been recorded.
  const changes=store.db.prepare('SELECT coalesce(max(rowid),0) AS scores FROM score_changes');
  let last=changes.get()!;
  prepareMilestones(store.db);
  return createServer(async (req,res)=>{
    function json(status:number,value:unknown) {
      if(req.method==='POST'&&status<300){
        const now=changes.get()!;
        if(now.scores!==last.scores||/^\/api\/milestone-tests\/[^/]+\/(submit|discard)$/.test(req.url??'')){
          prepareMilestones(store.db);
          last=now;
        }
      }
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(value));
    }
    try {
      const url = new URL(req.url ?? '/','http://localhost');
      const path = decodeURIComponent(url.pathname);
      res.setHeader('X-Content-Type-Options','nosniff');
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
        if (new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403,'Cross-origin writes are unavailable.');
      }
      const ctx = {req,res,url,store,json,body:()=>body(req)};
      for (const feature of features) if (await feature(ctx)) return;
      if (path==='/api/features' && req.method==='GET') {
        const assets=files('public/features');
        return json(200,{js:assets.filter(f=>f.endsWith('.js')),css:assets.filter(f=>f.endsWith('.css'))});
      }
      if (path==='/api/stories' && req.method==='GET') return json(200,store.stories());
      const match = path.match(/^\/api\/stories\/([^/]+)(\/position)?$/);
      if (match && !match[2] && req.method==='GET') {
        const story=store.story(match[1]);
        const preview=story.preview;
        const focus=new Map<string,PreviewItem>();
        let ordered:PreviewItem[]=[];
        if(url.searchParams.has('focus') && preview){
          for(const item of [...preview.words??[],...preview.compound?[preview.compound]:[],...preview.characters??[],
            ...preview.review??[],...preview.wordReview??[]]){
            const entry=focus.get(item.text)??{text:item.text};
            entry.pinyin||=item.pinyin;
            entry.meaning||=item.meaning;
            entry.example||=item.example;
            focus.set(item.text,entry);
          }
          const tier=storyFocus(story);
          const order={strong:0,medium:1,soft:2,other:3};
          ordered=[...focus.values()].sort((a,b)=>order[tier(a.text)]-order[tier(b.text)]);
        }
        return json(200,{...(url.searchParams.has('focus')?{focus:ordered.map(item=>({...item,color:strengthFor(store.db,'word',item.text).color}))}:{}),story:{...story,chapters:readerChapters(store,story)},position:store.position(match[1])});
      }
      if (match && match[2] && req.method==='POST') {
        const {chapter,paragraph}=await ctx.body();
        const previous=store.position(match[1]);
        store.db.exec('BEGIN IMMEDIATE');
        try {
          const position=store.move(match[1],chapter,paragraph);
          if(previous.chapter!==chapter||previous.paragraph!==paragraph)markAdvance(store,match[1],chapter);
          store.db.exec('COMMIT');
          return json(200,position);
        }catch(error){store.db.exec('ROLLBACK');throw error;}
      }
      if (req.method!=='GET' && req.method!=='HEAD') return json(405,{error:'Method unavailable.'});
      const artwork = path==='/art/tea-shop.png';
      const filename = artwork ? join(root,'docs','Street Talk reading week dashboard-2.png') : resolve(publicDir,'.'+(path==='/'?'/index.html':path));
      if ((!artwork && !filename.startsWith(publicDir+sep)) || !existsSync(filename) || !statSync(filename).isFile()) return json(404,{error:'Page not found.'});
      res.writeHead(200,{'Content-Type':mime[extname(filename)]??'application/octet-stream'});
      res.end(req.method==='HEAD'?undefined:readFileSync(filename));
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      const error = e as Error & { status?:number };
      json(error.status ?? 500,{error:error.message || 'Unable to process request.'});
    }
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const dir = process.env.DATA_DIR ?? join(root,'runtime');
  mkdirSync(dir,{recursive:true});
  const app = await createApp(new ReadingStore(join(dir,'reading.sqlite')));
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port,process.env.HOST ?? '0.0.0.0',()=>console.log('Dudian is listening on port '+port));
}
