import {mkdir,readFile,rename,stat,unlink,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

const directory=()=>resolve(process.env.DUDIAN_COVER_JOBS??'.work/cover-jobs');
export async function workerOnline() {
  try{return Date.now()-(await stat(join(directory(),'heartbeat'))).mtimeMs<30000;}
  catch{return false;}
}

export async function coverWorkerModels():Promise<string[]> {
  try{
    const models=JSON.parse(await readFile(join(directory(),'worker-models.json'),'utf8'));
    return Array.isArray(models)?models.filter(m=>typeof m==='string'):[];
  }catch{return [];}
}
export async function subscriptionCover(prompt:string,reference:Buffer,model='') {
  if(!await workerOnline())throw Error('Start the Dudian cover worker on the Docker host, then retry.');
  if(model && !(await coverWorkerModels()).includes(model))throw Error('The selected Codex cover model is unavailable. Check the worker and choose another model in Settings.');
  const dir=directory(),id=randomUUID(),path=(suffix:string)=>join(dir,id+'.'+suffix);
  const extension=reference[0]===255?'jpg':reference[0]===137?'png':'webp';
  const input='reference.'+extension;
  await mkdir(dir,{recursive:true});
  const expires=Date.now()+12*60_000;
  try{
    await writeFile(path(input),reference);
    await writeFile(path('tmp'),JSON.stringify({prompt,expires,extension,model}));
    await rename(path('tmp'),path('job'));
    while(Date.now()<expires){
      for(const suffix of ['png','error']){
        let data:Buffer;
        try{data=await readFile(path(suffix));}
        catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        if(suffix==='error')throw Error(data.toString().slice(0,450));
        return data;
      }
      if(!await workerOnline())throw Error('The subscription cover worker disconnected. Restart it and retry.');
      await wait(1000);
    }
    throw Error('The subscription cover took too long. Try again.');
  }finally{
    await Promise.all(['tmp','job','png','error',input].map(s=>unlink(path(s)).catch(()=>{})));
  }
}
