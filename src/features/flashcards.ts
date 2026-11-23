import type {Context} from '../server.ts';
import {gradeCard,readSession,startSession} from '../flashcards.ts';
import {flashcardExample} from '../flashcard-example.ts';

export default async function flashcards({req,url,store,body,json}: Context) {
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
