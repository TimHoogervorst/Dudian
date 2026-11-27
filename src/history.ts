import { type ReadingStore,type Story } from './store.ts';
import { catalog } from './catalog.ts';

export async function openStory(store:ReadingStore,id:string,at=Date.now()) {
  await store.story(id);

  await store.db.prepare('INSERT INTO opened_stories(story_id,at) VALUES($1,$2) ON CONFLICT(account_id,story_id) DO UPDATE SET at=excluded.at').run(id,at);
}

// Use exact-band shares, so HSK 1 vocabulary never contributes to a higher tag.
function storyTags(counts:number[]){
  const total=counts.reduce((sum,count)=>sum+count,0);
  return counts.flatMap((count,index)=>count>0 && count*10>=total?[index+1]:[]);
}

export async function history(store:ReadingStore) {

  const missing=await store.db.prepare('SELECT s.id,s.content FROM stories s LEFT JOIN story_levels l ON l.id=s.id WHERE l.counts IS NULL').all();
  const save=store.db.prepare('INSERT INTO story_levels(id,counts) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET counts=excluded.counts');
  for(const row of missing){
    const story:Story=JSON.parse(String(row.content));
    const counts=[0,0,0,0,0,0];
    for(const chapter of story.chapters)for(const paragraph of chapter.paragraphs)for(const token of paragraph){
      if(token.cast)continue;
      const level=catalog.wordLevel(token.entry??token.text);
      if(level)counts[level-1]++;
    }
    await save.run(row.id,JSON.stringify(counts));
  }
  const rows=await store.db.prepare(`
    SELECT s.id,s.title,s.created_at,l.counts,s.content->>'difficulty' difficulty,(s.content->'cover') IS NOT NULL AS has_cover,coalesce(p.chapter,0) chapter,coalesce(p.paragraph,0) paragraph,
      s.content->'chapters'->coalesce(p.chapter,0)->>'title' chapter_title,
      jsonb_array_length(s.content->'chapters') chapter_count,
      coalesce(o.at,p.updated_at) opened, c.story_id IS NOT NULL finished,a.status AS art_status
    FROM stories s
    JOIN story_levels l ON l.id=s.id
    LEFT JOIN opened_stories o ON o.story_id=s.id
    LEFT JOIN positions p ON p.story_id=s.id
    LEFT JOIN story_completions c ON c.story_id=s.id
    LEFT JOIN story_art a ON a.id=s.id
    WHERE s.id NOT IN (SELECT story_id FROM hidden_stories)
    ORDER BY greatest(s.created_at,coalesce(o.at,0),coalesce(p.updated_at,0),coalesce(c.at,0)) DESC,s.id
  `).all();
  const stories=rows.map(row=>{
    const hskTags=storyTags(JSON.parse(String(row.counts)));
    return {
    id:String(row.id),createdAt:Number(row.created_at),title:String(row.title),hskTags,hskLevel:hskTags.at(-1)??null,difficulty:row.difficulty,hasCover:Boolean(row.has_cover),artStatus:row.art_status,chapter:Number(row.chapter),chapterTitle:String(row.chapter_title),
    paragraph:Number(row.paragraph),chapterCount:Number(row.chapter_count),finished:Boolean(row.finished),opened:row.opened!==null
    };
  });
  return {current:stories.filter(story=>story.opened&&!story.finished).sort((a,b)=>b.createdAt-a.createdAt)[0]??null,stories};
}
