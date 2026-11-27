import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { existsSync,mkdirSync,readdirSync,readFileSync,statSync } from 'node:fs';
import { join,extname,resolve,sep } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { ReadingStore,HttpError } from './store.ts';
import { readerChapters } from './chapter-check.ts';
import { strengthFor } from './strength.ts';
import { storyFocusEntries } from './story-focus.ts';
import { markAdvance } from './activity.ts';
import { prepareMilestones } from './milestone-test.ts';
import { generationWorker } from './generation-job.ts';
import { database,initializeDatabase } from './postgres/database.ts';
import { LearnerDatabase } from './postgres/learner-database.ts';
import { authenticate,sessionAccount } from './postgres/session.ts';
import type { Pool } from 'pg';

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
export async function createApp(pool: Pool) {
  await initializeDatabase(pool);
  await pool.query("UPDATE story_art SET status='failed',error='Drawing was interrupted. Retry the illustration.' WHERE status='drawing'");
  const stores=new Map<string,ReadingStore>();
  const scores=new Map<string,number>();
  const features: Handler[] = [];
  for (const file of files('src/features').filter(f=>f.endsWith('.ts'))) {
    const feature = await import(pathToFileURL(join(root,'src/features',file)).href);
    if (typeof feature.default === 'function') features.push(feature.default);
  }
  const server=createServer(async (req,res)=>{
    function json(status:number,value:unknown) {
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
      if (path==='/api/session' && req.method==='GET') {
        const account=await sessionAccount(pool,req);
        return json(200,{username:account?.username??null});
      }
      if (req.method==='POST' && ['/api/login','/api/register','/api/logout'].includes(path)) {
        return json(200,await authenticate(pool,path,req,res,path==='/api/logout'?null:await body(req)));
      }
      if (path.startsWith('/api/')) {
        const account=await sessionAccount(pool,req);
        if (!account) throw new HttpError(401,'Sign in to open your reader.');
        let store=stores.get(account.id);
        if (!store) {
          store=new ReadingStore(new LearnerDatabase(pool,account.id));
          stores.set(account.id,store);
        }
        let response: {status:number,value:unknown} | undefined;
        const reply=(status:number,value:unknown)=>{response={status,value};};
        const ctx = {req,res,url,store,json:reply,body:()=>body(req)};
        for (const feature of features) if (await feature(ctx)) {
          if (response && (req.method==='POST'||!scores.has(account.id))) {
            const count=Number((await store.db.prepare('SELECT coalesce(max(rowid),0) AS n FROM score_changes').get()).n);
            if(count!==scores.get(account.id)||/milestone-tests.*(submit|discard)/.test(path)){
              scores.set(account.id,count);
              await prepareMilestones(store.db);
            }
          }
          if(response) json(response.status,response.value);
          return;
        }
        if (path==='/api/features' && req.method==='GET') {
          const assets=files('public/features');
          return json(200,{js:assets.filter(f=>f.endsWith('.js')),css:assets.filter(f=>f.endsWith('.css'))});
        }
        if (path==='/api/stories' && req.method==='GET') return json(200,await store.stories());
        const match = path.match(/^\/api\/stories\/([^/]+)(\/position)?$/);
        if (match && !match[2] && req.method==='GET') {
          const story=await store.story(match[1]);
          const ordered=url.searchParams.has('focus')?storyFocusEntries(story.preview):[];
          return json(200,{...(url.searchParams.has('focus')?{focus:await Promise.all(ordered.map(async item=>({...item,color:(await strengthFor(store.db,'word',item.text)).color})))}:{}),story:{...story,chapters:await readerChapters(store,story)},position:await store.position(match[1])});
        }
        if (match && match[2] && req.method==='POST') {
          const {chapter,paragraph}=await ctx.body();
          const current=store;
          const saved=await store.db.transaction(async () => {
            const previous=await current.position(match[1]);
            const position=await current.move(match[1],chapter,paragraph);
            if(previous.chapter!==chapter||previous.paragraph!==paragraph)await markAdvance(current,match[1],chapter);

            return position;
          });
          return json(200,saved);
        }
        return json(404,{error:'Unknown API endpoint.'});
      }
      if (req.method!=='GET' && req.method!=='HEAD') return json(405,{error:'Method unavailable.'});
      const artwork = path==='/art/tea-shop.png';
      const filename = artwork ? join(root,'docs','Street Talk reading week dashboard-2.png') : resolve(publicDir,'.'+(path==='/'?'/index.html':path));
      if ((!artwork && !filename.startsWith(publicDir+sep)) || !existsSync(filename) || !statSync(filename).isFile()) return json(404,{error:'Page not found.'});
      res.writeHead(200,{'Content-Type':mime[extname(filename)]??'application/octet-stream'});
      res.end(req.method==='HEAD'?undefined:readFileSync(filename));
    } catch (e) {
      if (res.headersSent) { console.error('Reader request:',(e as Error).message); return; }
      const error = e as Error & { status?:number };
      if (!error.status) console.error('Reader request:', error.message);
      json(error.status ?? 500,{error:error.status ? error.message : 'Unable to process request.'});
    }
  });
  const stop=generationWorker(pool);
  server.once('close',stop);
  return server;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const dir = process.env.DATA_DIR ?? join(root,'runtime');
  mkdirSync(dir,{recursive:true});
  const app = await createApp(database());
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port,process.env.HOST ?? '0.0.0.0',()=>console.log('Dudian is listening on port '+port));
}
