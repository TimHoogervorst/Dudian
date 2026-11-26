import {catalog} from './catalog.ts';
import type {PracticeCharacters} from './practice-characters.ts';

export function practiceSenses(form:string, policy:PracticeCharacters){
  if(!/^\p{Script=Han}+$/u.test(form) || ![...form].every(c=>policy.available.includes(c)||catalog.characterLevel(c)===policy.passed+1))return;
  return catalog.get('word',form)?.senses.slice(0,8);
}

type Occurrence={
  id:string; form:string; sentence:string; translation?:string; position:number; meanings:string[];
  tokens:unknown[];
};

export async function resolveStorySenses(draft:any,policy:PracticeCharacters,write:(prompt:string)=>Promise<string>){
  let pending:Occurrence[]=[];
  function inspect(tokens:unknown, location:string, translation?:string){
    if(!Array.isArray(tokens))return;
    const forms=tokens.map(token=>typeof token==='string'?token.split(/[:=]/,1)[0]:'');
    for(const [position,raw] of tokens.entries()){
      if(typeof raw!=='string'||raw==='包包:1')continue;
      const parts=/^(\p{Script=Han}+)(?::(-?\d+)|=(.*))?$/u.exec(raw);
      if(!parts)continue;
      const [,form,number,gloss]=parts;
      const senses=practiceSenses(form,policy);
      if(!senses?.length)continue;
      const index=Number(number);
      if(number && String(index)===number && index>=1 && index<=senses.length)continue;
      const meanings=senses.map(s=>s.meaning);
      const matches=gloss===undefined?[]:meanings.flatMap((meaning,i)=>
        [meaning,...meaning.split(';')].some(part=>part.trim().toLowerCase()===gloss.trim().toLowerCase())?[i+1]:[]);
      if(senses.length===1 || matches.length===1){
        tokens[position]=form+':'+(matches[0]??1);
      }else{
        const sentence=forms.map((text,i)=>i===position?'【'+text+'】':text).join('');
        pending.push({id:location+'-t'+(position+1),form,sentence,translation,position:position+1,meanings,tokens});
      }
    }
  }
  if(Array.isArray(draft?.chapters))for(const [c,chapter] of draft.chapters.entries()){
    if(!Array.isArray(chapter?.paragraphs))continue;
    for(const [p,paragraph] of chapter.paragraphs.entries()){
      if(Array.isArray(paragraph))paragraph.forEach((sentence,s)=>inspect(sentence,'c'+(c+1)+'-p'+(p+1)+'-s'+(s+1),
        typeof chapter.translations?.[p]==='string'?chapter.translations[p]:undefined));
    }
  }
  inspect(draft?.teaser,'teaser');
  for(let attempt=0;pending.length && attempt<4;attempt++){
    const prompt=[
      'Select the dictionary sense for each occurrence in context. Position and sense numbers start at 1.',
      'Return only {"selections":[{"id":"...","sense":1}]} with each requested ID exactly once.',
      JSON.stringify(pending.map(({tokens,...context})=>context))
    ].join('\n');
    const response=await write(prompt);
    let selections:unknown;
    try{selections=JSON.parse(response)?.selections;}catch{continue;}
    if(!Array.isArray(selections))continue;
    const answers=new Map<string,number>();
    for(const selection of selections){
      if(typeof selection?.id==='string')answers.set(selection.id,answers.has(selection.id)?0:selection.sense);
    }
    pending=pending.filter(item=>{
      const sense=answers.get(item.id);
      if(typeof sense!=='number'||!Number.isInteger(sense)||sense<1||sense>item.meanings.length)return true;
      item.tokens[item.position-1]=item.form+':'+sense;
      return false;
    });
  }
  if(pending.length)throw Error('Could not resolve dictionary senses after three retries: '+pending.map(o=>o.form+' ('+o.id+')').join(', '));
}
