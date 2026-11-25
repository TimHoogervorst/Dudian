import {catalog} from './catalog.ts';
import type {Story,Token} from './store.ts';

export function numberSentences(tokens:Token[]) {
  let sentence=0;
  return tokens.map(token=>{
    const numbered={...token,sentence};
    if(/[。！？!?]/u.test(token.text))sentence++;
    return numbered;
  });
}

export function recoverCoverTokens(story:Story):Token[]{
  return dictionaryTokens(story,story.cover!.teaser);
}

// Older stories retained only the plain text. Prefer the readings already used in the story.
export function dictionaryTokens(story:Pick<Story,'chapters'>, text:string, segments?:string[]):Token[] {
  const known=new Map(story.chapters.flatMap(c=>c.paragraphs.flat()).filter(t=>t.entry||t.cast).map(t=>[t.text,t]));
  known.set('包包',{text:'包包',cast:'baobao',pinyin:'Bāobāo',meaning:'Our steamed-bun friend'});
  const tokens:Token[]=[];
  if(segments)return segments.map(text=>{
    const occurrence=known.get(text);
    if(occurrence)return occurrence;
    const sense=catalog.get('word',text)?.senses[0];
    return sense?{text,pinyin:sense.pinyin,meaning:sense.meaning}:{text};
  });
  let rest=text;
  while(rest){
    const first=[...rest][0];
    let token:Token={text:first};
    if(/\p{Script=Han}/u.test(first)){
      const prefix=rest.match(/^\p{Script=Han}+/u)![0];
      for(let length=Math.min(12,prefix.length);length>0;length--){
        const text=prefix.slice(0,length);
        const occurrence=known.get(text);
        if(occurrence){token=occurrence;break;}
        const sense=catalog.get('word',text)?.senses[0];
        if(sense){token={text,entry:text,sense:sense.id,pinyin:sense.pinyin,meaning:sense.meaning};break;}
      }
    }
    tokens.push(token);
    rest=rest.slice(token.text.length);
  }
  return numberSentences(tokens);
}
