import type {Context} from '../server.ts';
import {gradeCard,readSession,startSession} from '../flashcards.ts';
import {flashcardExample} from '../flashcard-example.ts';

import {startPractice,extendPractice,submitPractice,practiceView} from '../library-practice.ts';

export default async function flashcards({req,url,store,body,json}: Context) {
  const sets='/api/practice/sets';
  if(url.pathname===sets&&req.method==='POST'){
    json(201,startPractice(store.db,(await body())??{}));
    return true;
  }
  const set=url.pathname.match(/^\/api\/practice\/sets\/([a-f0-9-]+)(?:\/(submit|extend))?$/);
  if(set){
    if(!set[2]&&req.method==='GET')json(200,practiceView(store.db,set[1]));
    else if(set[2]==='extend'&&req.method==='POST')json(201,extendPractice(store.db,set[1]));
    else if(set[2]==='submit'&&req.method==='POST'){
      const {index,answers,zone}=await body();
      json(200,submitPractice(store.db,set[1],index,answers,zone));
    }else return false;
    return true;
  }
  const base = '/api/flashcards/sessions';
  if (url.pathname===base && req.method==='POST') {
    const deck = await body();
    json(201,startSession(store.db,deck ?? {}));
    return true;
  }
  const match = url.pathname.match(/^\/api\/flashcards\/sessions\/([a-f0-9-]+)(\/grade|\/example)?$/);
  if (!match) return false;
  if(req.method==='POST' && match[2]==='/example'){
    json(200,await flashcardExample(store.db,match[1],(await body()).index));
    return true;
  }
  if (req.method==='GET' && !match[2]) {
    json(200,readSession(store.db,match[1]));
    return true;
  }
  if (req.method==='POST' && match[2]) {
    const {index,grade,zone} = await body();
    json(200,gradeCard(store.db,match[1],index,grade,Date.now(),zone));
    return true;
  }
  return false;
}
