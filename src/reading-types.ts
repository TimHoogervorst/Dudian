export const milestones={
  book:[['Baby book',0],['Children’s book',0.2],['Chapter book',2]],
  article:[['Notice',0],['Letter',0.5],['Recipe',1],['Short news report',2]],
  dialogue:[['Two-person chat',0],['Three-person chat',1],['Four-person chat',2],['Five-person chat',3]]
} as const;
export type ReadingType=keyof typeof milestones;
export type BookStage=typeof milestones.book[number][0];
export type ArticleKind=typeof milestones.article[number][0];
export type ReadingFormat={type:'book';stage:BookStage}|{type:'article';documents:ArticleKind[]}|{type:'dialogue';people:number};
export const messages={easy:6,medium:10,hard:14} as const;
export function progression(level:number){
  return Object.entries(milestones).map(([type,items])=>{
    const current=items.filter(([,threshold])=>threshold<=level).at(-1);
    return {type,cards:items.map(([label,threshold])=>({label,threshold,unlocked:level>=threshold,current:type==='book'&&label===current?.[0]}))};
  });
}
export function readingOptions(level:number,previous?:number){
  const stage=milestones.book.filter(([,n])=>level>=n).at(-1)![0];
  const maximum=1+milestones.dialogue.filter(([,n])=>level>=n).length;
  const people=previous && previous<=maximum?previous:2+Math.floor(Math.random()*(maximum-1));
  return {stage,people};
}
export function articleDocuments(level:number,count:number):ArticleKind[]{
  const unlocked=milestones.article.filter(([,n])=>level>=n).map(([name])=>name);
  const eligible=unlocked.includes('Letter')?unlocked.filter(kind=>kind!=='Notice'):unlocked;
  const documents:ArticleKind[]=[];
  let pool:ArticleKind[]=[];
  while(documents.length<count){
    if(!pool.length)pool=[...eligible];
    documents.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  }
  return documents;
}
