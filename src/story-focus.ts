import { catalog } from './catalog.ts';
import type { PreviewItem, Story } from './store.ts';

export function storyFocusEntries(preview:Story['preview']) {
  if (!preview) return [];
  const entries=new Map<string,PreviewItem & {strong:boolean}>();
  function add(item:PreviewItem,strong:boolean) {
    const entry=entries.get(item.text)??{text:item.text,strong};
    entry.pinyin||=item.pinyin;
    entry.meaning||=item.meaning;
    entry.example||=item.example;
    entries.set(item.text,entry);
  }
  for (const item of [...preview.words??[],...preview.compound?[preview.compound]:[],
    ...preview.characters??[],...preview.review??[]]) add(item,true);
  for (const text of preview.reviewCharacters??[]) {
    const sense=catalog.studySense(text);
    add({text,pinyin:sense?.pinyin,meaning:sense?.meaning},true);
  }
  for (const item of preview.wordReview??[]) add(item,false);
  return [...entries.values()];
}
