import {el,link} from './ui.js';
import {addSpeaker} from './reader-audio.js';
import {icon} from './icons.js';

export function reviewHref(id,chapter,round){
  return '#/read/'+encodeURIComponent(id)+'/'+chapter+'/review/'+round;
}

export function readerFrame(root,{title,back,dictionary,lookupHint='Select a word to read its meaning.'}){
  const grid=el('div',null,'reader-grid');
  const contents=el('aside',null,'chapter-list');
  const list=el('ol');
  contents.append(back,el('h2',title),list);
  const center=el('section',null,'reader-center');
  grid.append(contents,center);
  root.append(grid);
  let aside,definition;
  if(dictionary){
    aside=el('aside',null,'dictionary');
    const heading=el('h2','Dictionary');
    heading.prepend(icon('book'));
    definition=el('div',null,'dictionary-entry');
    definition.append(el('p',lookupHint));
    aside.append(heading,definition);grid.append(aside);
  }
  function chapter(content,{label,pinyin=false,translation,signal,baby=false}){
    center.append(chapterHeading(label,content.title));
    const article=readingText(content.paragraphs,{dictionary,pinyin});
    const paragraphs=Array.from(article.children);
    const unit=baby?'Page':content.speakers?'Message':'Paragraph';
    if(baby)article.classList.add('baby-pages');
    formatParagraphs(article,content);
    paragraphs.forEach((para,index)=>{
      addSpeaker(para,'Listen to '+unit.toLowerCase()+' '+(index+1),[{text:content.paragraphs[index].map(t=>t.text).join('')}],signal);
      if(translation)para.after(translation(index));
    });
    center.append(article);
    return {article,paragraphs,unit};
  }
  return {center,list,aside,definition,chapter};
}

export function chapterHeading(label,title){
  const heading=el('header',null,'chapter-heading');
  const name=el('h1',title);name.tabIndex=-1;
  heading.append(el('p',label,'overline'),name);
  return heading;
}

export function readerLayout(root,story,activeChapter,activeReview){
  const id=story.id;
  const frame=readerFrame(root,{title:story.title,back:link('← Reading desk','#/home','text-link'),dictionary:!activeReview,
    lookupHint:activeChapter===-1?'Hover or tap a summary word to see its meaning.':undefined});
  const {list}=frame;
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
  return frame;
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

export function readingWord(word,pinyin,characterClasses){
  const text=document.createDocumentFragment();
  if(characterClasses?.size){
    for(const char of word.text)text.append(characterClasses.has(char)?el('span',char,characterClasses.get(char)):char);
  }else text.append(word.text);
  if(!pinyin||!word.pinyin)return text;
  const ruby=el('ruby');
  ruby.append(text);
  ruby.append(el('rt',word.pinyin));
  return ruby;
}

function formatParagraphs(article,chapter){
  if(chapter.speakers)article.classList.add('message-thread');
  let step=0;
  Array.from(article.children).forEach((para,index)=>{
    if(chapter.speakers){
      const speaker=chapter.speakers[index];
      para.classList.add(speaker===0?'outgoing':'incoming');
      para.prepend(el('small',chapter.names[speaker]+(speaker===0?' · You':''),'message-author'));
    }
    const role=chapter.sections?.[index];
    if(role){
      para.classList.add('document-'+role);
      if(role==='step')para.prepend(el('small','Step '+(++step),'document-label'));
      if(role==='ingredients'&&index===0)para.prepend(el('small','Ingredients','document-label'));
    }
  });
}

export function readingText(paragraphs,{dictionary=true,pinyin=false}={}){
  const article=el('article',null,'chapter-text'); article.lang='zh-Hans';
  for(const [p,tokens] of paragraphs.entries()) {
    const para=el('p'); para.dataset.paragraph=p;
    tokens.forEach((token,t)=>{
      const span=el('span');span.append(readingWord(token,pinyin));
      if(dictionary&&/[\p{Script=Han}]/u.test(token.text)) {
        span.dataset.word=token.text;span.dataset.paragraph=p;span.dataset.token=t;
      }
      para.append(span);
    });
    article.append(para);
  }
  return article;
}
