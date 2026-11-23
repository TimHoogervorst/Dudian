import {ui,el,link,api} from './ui.js';
export async function reader({root,parts}) {
  const id=parts[0]||'tea-shop';
  const endpoint='/api/stories/'+encodeURIComponent(id);
  const {story,position}=await api(endpoint);
  if(parts[1]!==undefined) {
    const chapter=Number(parts[1]);
    if(!Number.isInteger(chapter)||!story.chapters[chapter])throw Error('Unknown chapter.');
    if(chapter!==position.chapter)Object.assign(position,await api(endpoint+'/position',{chapter,paragraph:0}));
  }
  const chapter=story.chapters[position.chapter];
  const grid=el('div',null,'reader-grid');
  const contents=el('aside',null,'chapter-list');
  contents.append(link('← Reading desk','#/home','text-link'),el('h2',story.title));
  const list=el('ol');
  story.chapters.forEach((item,i)=>{
    const li=el('li'), a=link(item.title,'#/read/'+encodeURIComponent(id)+'/'+i);
    if(i===position.chapter)a.setAttribute('aria-current','page');
    li.append(a); list.append(li);
  });
  contents.append(list);
  const center=el('section',null,'reader-center');
  const heading=el('header',null,'chapter-heading');
  heading.append(el('p','Chapter '+(position.chapter+1)+' of '+story.chapters.length,'overline'),el('h1',chapter.title));
  center.append(heading);
  if(story.id==='tea-shop')center.append(el('div',null,'tea-art chapter-art'));
  const article=el('article',null,'chapter-text'); article.lang='zh-Hans';
  for(const [p,tokens] of chapter.paragraphs.entries()) {
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
  const controls=el('div',null,'reader-controls');
  const cursor=el('div',null,'paragraph-nav');
  const prev=el('button','←');prev.setAttribute('aria-label','Previous paragraph');
  const next=el('button','→');next.setAttribute('aria-label','Next paragraph');
  const where=el('span');
  cursor.append(prev,where,next);controls.append(cursor);
  const aside=el('aside',null,'dictionary');
  aside.append(el('h2','Dictionary'),el('p','Select a word to read its meaning.'));
  center.append(article,controls);grid.append(contents,center,aside);root.append(grid);
  const context={root,story,position,article,aside,controls,chapter};
  function showPosition(scroll) {
    [...article.children].forEach((p,i)=>p.classList.toggle('current-paragraph',i===position.paragraph));
    where.textContent='Paragraph '+(position.paragraph+1)+' of '+chapter.paragraphs.length;
    prev.disabled=!position.paragraph;next.disabled=position.paragraph===chapter.paragraphs.length-1;
    if(scroll)article.children[position.paragraph]?.scrollIntoView({block:'nearest'});
  }
  let writing=false;
  async function move(p) {
    if(writing||p===position.paragraph)return;
    writing=true;
    try {
      const previous={...position};
      Object.assign(position,await api(endpoint+'/position',{chapter:position.chapter,paragraph:p}));
      showPosition(true);
      await ui.emit('position',{...context,previous});
    } finally { writing=false; }
  }
  prev.onclick=()=>move(position.paragraph-1);
  next.onclick=()=>move(position.paragraph+1);
  article.addEventListener('click',e=>{ const p=e.target.closest('p');if(p)void move(Number(p.dataset.paragraph)); });
  showPosition(position.paragraph>0);
  await ui.emit('reader',context);
}

