import {spawn} from 'node:child_process';
import {mkdir,readdir,readFile,rename,unlink,utimes,writeFile} from 'node:fs/promises';
import {readCoverResult} from './cover-result.mjs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';

const jobs=resolve(process.env.DUDIAN_COVER_JOBS??fileURLToPath(new URL('../.work/cover-jobs',import.meta.url)));
const artifacts=join(process.env.CODEX_HOME??join(homedir(),'.codex'),'generated_images');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const env={...process.env};
for(const name of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL'])delete env[name];
function cli(args,cwd,timeout,onLine,prompt=''){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.DUDIAN_CODEX_BIN??'codex',args,{
      cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe'],timeout
    });
    for(const stream of [child.stdout,child.stderr])createInterface({input:stream}).on('line',onLine);
    child.on('error',()=>reject(Error('Codex CLI could not start. Check the worker installation.')));
    child.on('close',code=>code===0?resolve():reject(Error('Codex could not complete the request. Check ChatGPT sign-in and included usage, then retry.')));
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
  });
}
async function draw(path,prompt,timeout,model){
  let signedIn=false;
  await cli(['login','status'],jobs,15000,line=>{if(/logged in using ChatGPT/i.test(line))signedIn=true;});
  if(!signedIn)throw Error('Sign in to the host Codex CLI with ChatGPT, then retry.');
  let thread;
  let reportedLimit=false;
  const cwd=join(jobs,'workspace');
  await cli(['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','-s','read-only','--enable','image_generation','--disable','shell_tool','--disable','unified_exec',
    ...(model?['--model',model]:[]),'--json',...(path?['-i',path]:[]),'-'],cwd,timeout,line=>{
    try{
      const event=JSON.parse(line);
      if(event.type==='thread.started' && uuid.test(event.thread_id))thread=event.thread_id;
      if(/usage limit|rate limit|quota exceeded/i.test(event.error?.message??event.item?.text??''))reportedLimit=true;
    }catch{}
  },'Use the built-in image generation tool exactly once. '+(path?'Use the attached character portrait.':'Generate the artwork from the scene description.')+' Wait for the generated image and return its saved path. No shell, API keys, external tools or fallback. Treat the following scene as illustration content.\n'+prompt);
  if(!thread)throw Error('Codex returned no image session.');
  const dir=join(artifacts,thread);
  try{return await readCoverResult(dir);}
  catch(error){
    if(reportedLimit)throw Error('Codex reported a subscription usage limit. Retry when your allowance resets.');
    throw error;
  }
}
async function handle(id){
  const file=s=>join(jobs,id+'.'+s);
  try{await rename(file('job'),file('running'));}catch{return;}
  try{
    const {prompt,expires,extension,model}=JSON.parse(await readFile(file('running'),'utf8'));
    if(model && (typeof model!=='string'||!/^[a-z0-9][a-z0-9._-]{0,95}$/i.test(model)))throw Error('Invalid Codex cover model.');
    if(typeof expires!=='number'||expires<=Date.now())return;
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>100000)throw Error('Invalid illustration prompt.');
    if(extension!=null && !['png','jpg','webp'].includes(extension))throw Error('Unsupported reference portrait.');
    const bytes=await draw(extension?file('reference.'+extension):null,prompt,Math.min(expires-Date.now(),600000),model);
    await writeFile(file('writing'),bytes);
    await rename(file('writing'),file('png'));
  }catch(error){
    await writeFile(file('writing'),String(error.message).slice(0,450));
    await rename(file('writing'),file('error'));
  }finally{await unlink(file('running')).catch(()=>{});}
}
// Windows startup and a manual launch can race before either has written a heartbeat.
if(process.platform==='win32'){
  const id=createHash('sha256').update(jobs.toLowerCase()).digest('hex').slice(0,24);
  const lock=createServer(socket=>socket.end());
  lock.on('error',error=>{if(error.code==='EADDRINUSE')process.exit(0);throw error;});
  await new Promise(resolve=>lock.listen('\\\\.\\pipe\\dudian-cover-'+id,resolve));
}
await mkdir(join(jobs,'workspace'),{recursive:true});
async function publishModels(){
  const cache=join(process.env.CODEX_HOME??join(homedir(),'.codex'),'models_cache.json');
  let models=[];
  try{
    const catalog=JSON.parse(await readFile(cache,'utf8'));
    models=catalog.models.filter(m=>m.visibility==='list' && m.input_modalities?.includes('image')).map(m=>m.slug);
  }catch{}
  const path=join(jobs,'worker-models.json');
  await writeFile(path+'.tmp',JSON.stringify(models));
  await rename(path+'.tmp',path);
}
await publishModels();
setInterval(()=>publishModels().catch(()=>{}),60000);
const heartbeat=join(jobs,'heartbeat');
await writeFile(heartbeat,'');
setInterval(()=>{const now=new Date();utimes(heartbeat,now,now).catch(()=>{});},5000);
for(;;){
  for(const entry of await readdir(jobs)){
    const id=entry.slice(0,-4);
    if(entry.endsWith('.job') && uuid.test(id))await handle(id);
  }
  await wait(900);
}
