import type {Context} from '../server.ts';
import {generateTest,startTest,submitTest,testView} from '../milestone-test.ts';

export default async function milestones({store,url,req,body,json}:Context){
  if(url.pathname==='/api/milestone-tests'&&req.method==='POST'){
    json(200,{id:await generateTest(store.db,(await body()).level)});
    return true;
  }
  const route=url.pathname.match(/^\/api\/milestone-tests\/([a-f0-9-]+)(?:\/(start|submit))?$/);
  if(!route)return false;
  const [,id,action]=route;
  if(!action&&req.method==='GET')json(200,testView(store.db,id));
  else if(action==='start'&&req.method==='POST')json(200,startTest(store.db,id));
  else if(action==='submit'&&req.method==='POST'){
    const {index,answers}=await body();
    json(200,submitTest(store.db,id,index,answers));
  }else return false;
  return true;
}
