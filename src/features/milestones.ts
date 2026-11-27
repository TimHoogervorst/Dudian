import type { Context } from '../server.ts';
import { generateTest,startTest,submitTest,testView,saveDraft,discardTest,preparation } from '../milestone-test.ts';
import { HttpError } from '../store.ts';

export default async function milestones({store,url,req,body,json}:Context){
  const db=store.db;
  if(url.pathname==='/api/milestone-tests'&&req.method==='POST'){
    json(200,{id:await generateTest(db,(await body()).level)});
    return true;
  }
  if(url.pathname==='/api/milestone-tests/preparation'&&req.method==='GET'){
    json(200,await preparation(db,Number(url.searchParams.get('level'))));
    return true;
  }
  const route=url.pathname.match(/^\/api\/milestone-tests\/([a-f0-9-]+)(?:\/(start|draft|submit|discard))?$/);
  if(!route)return false;
  const [,id,action]=route;
  if(!action&&req.method==='GET')json(200,await testView(db,id));
  else if(req.method!=='POST')return false;
  else if(action==='start')json(200,await startTest(db,id));
  else if(action==='draft'){
    const {section,task,answers}=await body();
    await saveDraft(db,id,section,task,answers);
    json(200,{});
  }else if(action==='submit'){
    if((await body()).confirm!==true)throw new HttpError(400,'Confirm final submission.');
    json(200,await submitTest(db,id));
  }else if(action==='discard'){await discardTest(db,id);json(200,{});}
  else return false;
  return true;
}
