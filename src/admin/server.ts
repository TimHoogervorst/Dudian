import {createServer} from 'node:http';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import type {Pool} from 'pg';
import {database,initializeDatabase} from '../postgres/database.ts';
import {LearnerDatabase} from '../postgres/learner-database.ts';
import {HttpError,ReadingStore} from '../store.ts';
import {body} from '../server.ts';
import {generationWorker} from '../generation-job.ts';
import {provider} from '../features/provider.ts';
import {catalogArt as art} from '../features/art.ts';
import {insights} from './insights.ts';
import {catalogWorker,enqueue} from './jobs.ts';
import type {CandidateWriter} from '../story-generation.ts';

const assets=new Map([
  ['/focus-deck.js','admin/focus-deck.js'],
  ['/builder.css','public/features/generation.css'],
  ['/','admin/index.html'],['/admin.js','admin/admin.js'],['/admin.css','admin/style.css'],
  ['/style.css','public/style.css'],['/icons.js','public/icons.js'],['/art/dudian-logo.png','docs/dudian-logo.png']
]);
const digest=(s:string)=>createHash('sha256').update(s).digest();
export async function createAdmin(pool:Pool,username:string,password:string,write?:CandidateWriter){
  if(!username || !password)throw Error('Set ADMIN_USERNAME and ADMIN_PASSWORD before starting the admin center.');
  await initializeDatabase(pool);
  // Shared artwork helpers access catalog tables only. This scope has no learner account.
  const store=new ReadingStore(new LearnerDatabase(pool,'00000000-0000-0000-0000-000000000000'));
  await pool.query("UPDATE story_art SET status='failed',error='Drawing was interrupted. Retry the illustration.' WHERE status='drawing'");
  const stop=catalogWorker(pool,store,write);
  const legacy=generationWorker(pool,write);
  const sessions=new Map<string,number>();
  const server=createServer(async(req,res)=>{
    const json=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      const url=new URL(req.url??'/','http://localhost');
      const file=assets.get(url.pathname);
      if(file && req.method==='GET'){
        const bytes=await readFile(new URL('../../'+file,import.meta.url));
        res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});res.end(bytes);return;
      }
      if(req.method==='POST' && req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)
        throw new HttpError(403,'Open the admin center to make changes.');
      if(url.pathname==='/api/login' && req.method==='POST'){
        const input=await body(req);
        if(typeof input?.username!=='string'||typeof input?.password!=='string'||!timingSafeEqual(digest(input.username),digest(username))||
          !timingSafeEqual(digest(input.password),digest(password)))throw new HttpError(401,'Incorrect administrator credentials.');
        for(const [key,end] of sessions)if(end<=Date.now())sessions.delete(key);
        const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);json(200,{token});return;
      }
      const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]??'';
      if((sessions.get(token)??0)<=Date.now())throw new HttpError(401,'Administrator sign-in required.');
      if(req.method==='POST' && url.pathname==='/api/logout'){sessions.delete(token);json(200,{});return;}
      if(req.method==='GET' && url.pathname==='/api/insights'){json(200,await insights(pool));return;}
      if(req.method==='GET' && url.pathname==='/api/users'){json(200,(await pool.query('SELECT username FROM accounts ORDER BY lower(username)')).rows);return;}
      if(req.method==='POST' && url.pathname==='/api/jobs'){json(202,await enqueue(pool,await body(req)));return;}
      if(req.method==='GET' && url.pathname==='/api/jobs'){
        json(200,(await pool.query(`SELECT j.id,j.request,j.stage,j.error,j.story_id,s.title,s.content->'preview'->'characters' AS focus
          FROM catalog_jobs j LEFT JOIN stories s ON s.id=j.story_id ORDER BY j.created_at DESC,j.id LIMIT 30`)).rows);return;
      }
      if(req.method==='GET' && url.pathname==='/api/story'){
        const story=await pool.query('SELECT content FROM stories WHERE id=$1',[url.searchParams.get('id')]);
        if(!story.rowCount)throw new HttpError(404,'Story unavailable.');
        json(200,story.rows[0].content);return;
      }
      const ctx={req,res,url,json,store,body:()=>body(req)};
      if(await provider(ctx)||await art(ctx))return;
      throw new HttpError(404,'Unknown admin endpoint.');
    }catch(e){
      if(!res.headersSent)json(e instanceof HttpError?e.status:500,{error:e instanceof HttpError?e.message:'Unable to complete the admin request.'});
      if(!(e instanceof HttpError))console.error(e);
    }
  });
  server.once('close',()=>{void stop();void legacy();});
  return server;
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  const app=await createAdmin(database(),process.env.ADMIN_USERNAME??'',process.env.ADMIN_PASSWORD??'');
  app.listen(Number(process.env.PORT??3001),process.env.HOST??'127.0.0.1');
}
