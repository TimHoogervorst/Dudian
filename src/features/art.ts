import type {Context} from '../server.ts';
import {HttpError} from '../store.ts';
import {artSettings,setArtSettings,imageType,imageLimit,portrait,queueArtwork} from '../cover-art.ts';
import type {IncomingMessage} from 'node:http';
import {workerOnline,coverWorkerModels} from '../subscription-art.ts';
import {imageModels} from '../cover-art.ts';

async function upload(req:IncomingMessage) {
  const chunks:Buffer[]=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>imageLimit)throw new HttpError(413,'Choose an image smaller than 12 MB.');
    chunks.push(chunk);
  }
  const bytes=Buffer.concat(chunks);
  imageType(bytes);
  return bytes;
}
export default async function art({url,req,res,store,json,body}:Context) {
  function image(bytes:Buffer){
    res.writeHead(200,{'Content-Type':imageType(bytes),'Cache-Control':'no-store'});
    res.end(bytes);
  }
  if(url.pathname==='/api/art-settings'){
    if(req.method==='GET')json(200,{...artSettings(store),imageModels,codexModels:await coverWorkerModels(),workerOnline:await workerOnline()});
    else if(req.method==='POST')json(200,setArtSettings(store,await body()));
    else return false;
  }else if(url.pathname==='/api/cast/baobao/portrait'){
    if(req.method==='GET')image(portrait(store));
    else if(req.method==='POST'){
      store.db.prepare('UPDATE art_settings SET portrait=? WHERE id=1').run(await upload(req));
      json(200,{saved:true});
    }else return false;
  }else{
    const match=url.pathname.match(/^\/api\/stories\/([^/]+)\/art\/(image|status|retry)$/);
    if(!match)return false;
    const id=decodeURIComponent(match[1]);
    if(!store.story(id).cover)throw new HttpError(404,'This story has no illustrated cover.');
    if(match[2]==='image' && req.method==='GET'){
      const row=store.db.prepare('SELECT image FROM story_art WHERE id=?').get(id);
      image(row?.image instanceof Uint8Array?Buffer.from(row.image):portrait(store));
    }else if(match[2]==='image' && req.method==='POST'){
      const bytes=await upload(req);
      store.db.prepare("INSERT OR REPLACE INTO story_art(id,status,image) VALUES(?,'imported',?)").run(id,bytes);
      json(200,{saved:true});
    }else if(match[2]==='status' && req.method==='GET'){
      const row=store.db.prepare('SELECT status,error FROM story_art WHERE id=?').get(id);
      const settings=artSettings(store);
      json(200,{status:'portrait',...row,enabled:settings.provider==='subscription'||settings.enabled});
    }else if(match[2]==='retry' && req.method==='POST'){
      queueArtwork(store,id);json(202,{accepted:true});
    }else return false;
  }
  return true;
}
