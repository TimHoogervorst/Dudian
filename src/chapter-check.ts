import {catalog} from './catalog.ts';
import {dictionaryTokens} from './cover-text.ts';
import {ReadingStore,HttpError,type Story} from './store.ts';
import {completionFor,finishChapter,ensureCompletions} from './completion.ts';
import {recordAnswer} from './story-scoring.ts';
import {sentenceText} from './word-actions.ts';
import {questionWords,readingItems,seeItem} from './encounters.ts';

export function readerChapters(store:ReadingStore,story:Story){
  ensureCompletions(store.db);
  const answered=new Set(store.db.prepare('SELECT chapter,question FROM quiz_attempts WHERE story_id=? AND choice IS NOT NULL')
    .all(story.id).map(row=>row.chapter+'/'+row.question));
  return story.chapters.map(({questions,...chapter},index)=>{
    const readingDone=!!questions?.length && questions.every((q,i)=>q.reviewRound || answered.has(index+'/'+i));
    const rounds=[...new Set(questions?.flatMap(q=>q.reviewRound?[q.reviewRound]:[]))];
    let available=readingDone;
    const reviews=rounds.map(round=>{
      const done=questions!.every((q,i)=>q.reviewRound!==round || answered.has(index+'/'+i));
      const item={round,done,available};
      available=available && done;
      return item;
    });
    return {...chapter,hasCheck:!!questions,readingDone,reviews};
  });
}

export function chapterCheck(store:ReadingStore,id:string,index:number) {
  const story=store.story(id),chapter=story.chapters[index];
  if(!chapter?.questions)throw new HttpError(404,'This chapter has no comprehension check.');
  const completion=completionFor(store,id);
  const rows=store.db.prepare('SELECT * FROM quiz_attempts WHERE story_id=? AND chapter=?').all(id,index);
  const questions=chapter.questions.map((q,i)=>{
    const row=rows.find(r=>r.question===i);
    const answered=typeof row?.choice==='number';
    const english=Boolean(row?.english);
    const display=(item:typeof q.prompt)=>({zh:item.zh,tokens:dictionaryTokens(story,item.zh,item.words),en:english?item.en:undefined});
    if(q.reviewRound){
      const source=story.chapters[q.sourceChapter??index]?.paragraphs[q.paragraph]?.[q.token];
      const pinyin=(source?.text===q.word?source.pinyin:undefined)??catalog.get('word',q.word,String(q.sense))?.senses.find(s=>s.id===q.sense)?.pinyin
        ??catalog.get('word',q.word)?.senses[0]?.pinyin;
      return {reviewRound:q.reviewRound,prompt:{zh:q.word,pinyin},choices:q.choices.map(c=>({en:c.en})),
        choice:row?.choice??null,correct:answered?q.correct:undefined};
    }
    return {prompt:display(q.prompt),choices:q.choices.map(display),english,choice:row?.choice??null,
      correct:answered?q.correct:undefined,evidence:answered?sentenceText(chapter.paragraphs[q.paragraph],q.token):undefined};
  });
  return {title:chapter.title,questions,completion,next:story.chapters.findIndex((_,i)=>!completion.chapters.includes(i))};
}

export function updateCheck(store:ReadingStore,id:string,index:number,input:any) {
  const story=store.story(id),chapter=story.chapters[index];
  const question=chapter?.questions?.[input?.question];
  if(!Number.isInteger(input?.question)||!question)throw new HttpError(400,'Choose a chapter question.');
  if(question.reviewRound && input.action==='english')throw new HttpError(400,'Choose the English meaning.');
  if(input.action!=='english' && (input.action!=='answer'||!Number.isInteger(input.choice)||!question.choices[input.choice]))
    throw new HttpError(400,'Choose a valid answer.');
  const {db}=store;
  completionFor(store,id);
  const key=[id,index,input.question];
  db.exec('BEGIN IMMEDIATE');
  try {
    if(question.reviewRound){
      const first=chapter.questions!.findIndex(q=>q.reviewRound===question.reviewRound);
      const prior=db.prepare('SELECT count(choice) AS n FROM quiz_attempts WHERE story_id=? AND chapter=? AND question<?').get(id,index,first);
      if(Number(prior?.n)!==first)throw new HttpError(409,'Finish the preceding cards first.');
    }
    db.prepare('INSERT OR IGNORE INTO quiz_attempts(story_id,chapter,question) VALUES(?,?,?)').run(...key);
    if(input.action==='english'){
      db.prepare('UPDATE quiz_attempts SET english=1 WHERE story_id=? AND chapter=? AND question=? AND choice IS NULL').run(...key);
    }else{
      const row=db.prepare('UPDATE quiz_attempts SET choice=? WHERE story_id=? AND chapter=? AND question=? AND choice IS NULL RETURNING english')
        .get(input.choice,...key);
      if(row){
        const now=Date.now();
        recordAnswer(db,story,index,input.question,input.choice===question.correct,Boolean(row.english),now);
        for(const text of readingItems([...questionWords(question.prompt),...questionWords(question.choices[input.choice])]))
          seeItem(db,text,now);
        const answered=db.prepare('SELECT count(choice) AS total FROM quiz_attempts WHERE story_id=? AND chapter=?').get(id,index);
        if(answered?.total===chapter.questions!.length)finishChapter(store,id,index);
      }
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return chapterCheck(store,id,index);
}
