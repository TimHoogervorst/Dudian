import {el,link} from './ui.js';
import {icon} from './icons.js';

export function reviewHref(id,chapter,round){
  return '#/read/'+encodeURIComponent(id)+'/'+chapter+'/review/'+round;
}

export function readerLayout(root,story,activeChapter,activeReview){
  const id=story.id;
  const grid=el('div',null,'reader-grid');
  const contents=el('aside',null,'chapter-list');
  contents.append(link('← Reading desk','#/home','text-link'),el('h2',story.title));
  const list=el('ol');
  if(story.cover){
    const item=el('li'),cover=link('Introduction','#/introduction/'+encodeURIComponent(id));
    cover.prepend(icon('book'));
    if(activeChapter===-1)cover.setAttribute('aria-current','page');
    item.append(cover);list.append(item);
  }
  story.chapters.forEach((item,i)=>{
    const li=el('li'), a=link(item.title,'#/read/'+encodeURIComponent(id)+'/'+i);
    a.dataset.chapter=i;
    a.prepend(el('span',String(i+1),'chapter-number'));
    if(i===activeChapter && !activeReview)a.setAttribute('aria-current','page');
    li.append(a); list.append(li);
    if(item.readingDone)addCheckmark(a);
    for(const review of item.reviews??[]){
      const row=el('li'),entry=link('Word review '+review.round,reviewHref(id,i,review.round));
      entry.dataset.review=review.round;
      entry.prepend(icon('books'));
      if(i===activeChapter && activeReview===review.round)entry.setAttribute('aria-current','page');
      if(review.done)addCheckmark(entry);
      row.append(entry);list.append(row);
    }
  });
  contents.append(list);
  const center=el('section',null,'reader-center');
  const aside=el('aside',null,'dictionary');
  const dictionaryHeading=el('h2','Dictionary');
  dictionaryHeading.prepend(icon('book'));
  const definition=el('div',null,'dictionary-entry');
  definition.append(el('p',activeChapter===-1?'Hover or tap a summary word to see its meaning.':'Select a word to read its meaning.'));
  aside.append(dictionaryHeading,definition);
  grid.append(contents,center);
  if(!activeReview)grid.append(aside);
  root.append(grid);
  return {center,aside,definition};
}

export function markCompleted(root,chapters){
  for(const a of root.querySelectorAll('.chapter-list [data-chapter]')){
    if(!chapters.includes(Number(a.dataset.chapter)) || a.querySelector('.chapter-done'))continue;
    addCheckmark(a);
  }
}

export function addCheckmark(a){
  if(!a || a.querySelector('.chapter-done'))return;
  const mark=el('span','✓','chapter-done');
  mark.setAttribute('aria-label','Completed');
  a.append(mark);
}

export function readingText(paragraphs){
  const article=el('article',null,'chapter-text'); article.lang='zh-Hans';
  for(const [p,tokens] of paragraphs.entries()) {
    const para=el('p'); para.dataset.paragraph=p;
    tokens.forEach((token,t)=>{
      const span=el('span',token.text);
      if(/[\p{Script=Han}]/u.test(token.text)) {
        span.dataset.word=token.text;span.dataset.paragraph=p;span.dataset.token=t;
      }
      para.append(span);
    });
    article.append(para);
  }
  return article;
}
