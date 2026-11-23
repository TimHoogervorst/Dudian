import {ui,el,link,api} from './ui.js';
import {trackParagraph} from './paragraph-scroll.js';
export async function reader({root,parts,signal,onLeave}) {
  const id=parts[0]||'tea-shop';
  const endpoint='/api/stories/'+encodeURIComponent(id);
  const {story,position}=await api(endpoint,undefined,signal);
  if(signal.aborted)return;
  if(parts[1]!==undefined) {
    const chapter=Number(parts[1]);
    if(!Number.isInteger(chapter)||!story.chapters[chapter])throw Error('Unknown chapter.');
    if(chapter!==position.chapter){
      const change=api(endpoint+'/position',{chapter,paragraph:0});
      onLeave(()=>change);
      Object.assign(position,await change);
      if(signal.aborted)return;
    }
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
  const context={root,story,position,article,aside,controls,chapter,signal,onLeave};
  const tracking=trackParagraph(()=>Array.from(article.children,p=>p.getBoundingClientRect()),()=>window.innerHeight,p=>move(p,false));
  function showPosition(scroll) {
    [...article.children].forEach((p,i)=>p.classList.toggle('current-paragraph',i===position.paragraph));
    where.textContent='Paragraph '+(position.paragraph+1)+' of '+chapter.paragraphs.length;
    prev.disabled=!position.paragraph;next.disabled=position.paragraph===chapter.paragraphs.length-1;
    if(scroll){
      tracking.programmatic();
      article.children[position.paragraph]?.scrollIntoView({block:'nearest'});
    }
  }
  let writing=Promise.resolve();
  function move(p,scroll) {
    if(p===position.paragraph || !chapter.paragraphs[p])return writing;
    const previous={...position};
    position.paragraph=p;
    showPosition(scroll);
    const update={...position};
    writing=writing.catch(()=>{}).then(()=>api(endpoint+'/position',update,undefined,true))
      .then(()=>ui.emit('position',{...context,previous}));
    writing.catch(error=>ui.notice(error.message));
    return writing;
  }
  prev.onclick=()=>move(position.paragraph-1,true);
  next.onclick=()=>move(position.paragraph+1,true);
  article.addEventListener('click',e=>{
    const p=e.target.closest('p');
    if(p){tracking.programmatic();void move(Number(p.dataset.paragraph),false);}
  });
  onLeave(()=>{tracking.flush();return writing;});
  const options={passive:true,signal};
  for(const e of ['wheel','touchmove'])window.addEventListener(e,tracking.intent,options);
  window.addEventListener('pointerdown',e=>{if(e.clientX>=document.documentElement.clientWidth)tracking.intent();},options);
  window.addEventListener('keydown',e=>{
    if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key))tracking.intent();
  },options);
  window.addEventListener('scroll',tracking.scrolled,options);
  window.addEventListener('pagehide',tracking.flush,options);
  showPosition(false);
  await ui.emit('reader',context);
  if(signal.aborted)return;
  showPosition(position.paragraph>0);
  await ui.emit('reader-ready',context);
}
