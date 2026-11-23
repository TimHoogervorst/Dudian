import {open,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

// Codex can publish an artifact after its final CLI event. Only inspect this run's folder.
export async function readCoverResult(directory,{waitMs=60000,pollMs=500}={}){
  const until=Date.now()+waitMs;
  do{
    try{
      const entries=await readdir(directory,{withFileTypes:true});
      for(const item of entries){
        if(!item.isFile()||!/\.(png|jpe?g|webp)$/i.test(item.name))continue;
        const file=await open(join(directory,item.name),'r');
        try{
          const {size}=await file.stat();
          if(size>12*1024*1024)throw Error('Codex returned an oversized cover.');
          if(size<24)continue;
          const bytes=await file.readFile();
          const png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND';
          const jpeg=bytes.readUInt16BE(0)===0xffd8 && bytes.readUInt16BE(bytes.length-2)===0xffd9;
          const webp=bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' && bytes.readUInt32LE(4)+8===bytes.length;
          if(png||jpeg||webp)return bytes;
        }finally{await file.close();}
      }
    }catch(error){
      if(!['ENOENT','EBUSY'].includes(error.code))throw error;
    }
    if(Date.now()<until)await wait(pollMs);
  }while(Date.now()<until);
  throw Error('Codex finished without saving a complete illustration for this request. Retry illustration.');
}
