import {ensureCompletions} from './completion.ts';
import {type ReadingStore} from './store.ts';

function ensureHistory(store:ReadingStore) {
  ensureCompletions(store.db);
  store.db.exec('CREATE TABLE IF NOT EXISTS opened_stories(story_id TEXT PRIMARY KEY REFERENCES stories(id), at INTEGER NOT NULL)');
}
export function openStory(store:ReadingStore,id:string,at=Date.now()) {
  store.story(id);
  ensureHistory(store);
  store.db.prepare('INSERT INTO opened_stories VALUES(?,?) ON CONFLICT(story_id) DO UPDATE SET at=excluded.at').run(id,at);
}

export function history(store:ReadingStore) {
  ensureHistory(store);
  const rows=store.db.prepare(`
    SELECT s.id,s.title,coalesce(p.chapter,0) chapter,coalesce(p.paragraph,0) paragraph,
      json_extract(s.content,'$.chapters['||coalesce(p.chapter,0)||'].title') chapter_title,
      json_array_length(s.content,'$.chapters') chapter_count,
      coalesce(o.at,p.updated_at) opened, c.story_id IS NOT NULL finished
    FROM stories s
    LEFT JOIN opened_stories o ON o.story_id=s.id
    LEFT JOIN positions p ON p.story_id=s.id
    LEFT JOIN story_completions c ON c.story_id=s.id
    ORDER BY max(s.created_at,coalesce(o.at,0),coalesce(p.updated_at,0),coalesce(c.at,0)) DESC,s.id
  `).all();
  const stories=rows.map(row=>({
    id:String(row.id),title:String(row.title),chapter:Number(row.chapter),chapterTitle:String(row.chapter_title),
    paragraph:Number(row.paragraph),chapterCount:Number(row.chapter_count),finished:Boolean(row.finished),opened:row.opened!==null
  }));
  return {current:stories.find(story=>story.opened&&!story.finished)??null,stories};
}
