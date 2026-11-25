import {ui,el,link,api} from './ui.js';
import {trackParagraph} from './paragraph-scroll.js';
import {reviewPage} from './review-page.js';
import {readerLayout,reviewHref} from './reader-layout.js';
function translationToggle(saved,load,signal){
  const details=el('details',null,'paragraph-translation');
  details.lang='en';
  const toggle=el('summary','Show translation');
  const content=el('div');
  content.setAttribute('role','status');
  details.append(toggle,content);
  let translation=saved,loading=false;
  details.ontoggle=async()=>{
    toggle.textContent=details.open?'Hide translation':'Show translation';
    if(!details.open||loading)return;
    if(translation){content.textContent=translation;return;}
    loading=true;content.textContent='Translating...';
    try{
      translation=(await load()).translation;
      content.textContent=translation;
    }catch(error){
      if(!signal.aborted)content.textContent=error.message+' Close and reopen to retry.';
    }finally{loading=false;}
  };
  return details;
}

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
  if(parts[2]==='review'){
    const round=Number(parts[3]);
    if(!chapter.reviews?.some(r=>r.round===round))throw Error('Unknown word review.');
    await reviewPage({root,story,position,round,signal,onLeave});
    return;
  }
  if(parts[1]===undefined){
    const pending=chapter.reviews?.find(r=>r.available && !r.done);
    if(pending){location.replace(reviewHref(id,position.chapter,pending.round));return;}
  }
  const frame=readerLayout(root,story,position.chapter);
  const {center,aside,definition}=frame;
  const baby=story.format?.stage==='Baby book';
  const {article,paragraphs,unit}=frame.chapter(chapter,{
    label:'Chapter '+(position.chapter+1)+' of '+story.chapters.length,baby,signal,
    translation:index=>translationToggle(chapter.translations?.[index],()=>api(endpoint+'/translation',
      {chapter:position.chapter,paragraph:index},signal),signal)
  });
  const controls=el('div',null,'reader-controls');
  const cursor=el('div',null,'paragraph-nav');
  const prev=el('button','←');prev.setAttribute('aria-label','Previous '+unit.toLowerCase());
  const next=el('button','→');next.setAttribute('aria-label','Next '+unit.toLowerCase());
  const where=el('span');
  cursor.append(prev,where,next);controls.append(cursor);
  center.append(controls);
  const context={root,story,position,article,aside,definition,controls,chapter,signal,onLeave};
  const tracking=trackParagraph(()=>paragraphs.map(p=>p.getBoundingClientRect()),()=>window.innerHeight,p=>move(p,false));
  function showPosition(scroll) {
    paragraphs.forEach((p,i)=>p.classList.toggle('current-paragraph',i===position.paragraph));
    if(baby)center.classList.toggle('inside-baby-book',position.paragraph<paragraphs.length-1);
    if(baby)paragraphs.forEach((p,i)=>{p.hidden=i!==position.paragraph;p.nextElementSibling.hidden=p.hidden;});
    where.textContent=unit+' '+(position.paragraph+1)+' of '+chapter.paragraphs.length;
    prev.disabled=!position.paragraph;next.disabled=position.paragraph===chapter.paragraphs.length-1;
    if(scroll){
      tracking.programmatic();
      paragraphs[position.paragraph]?.scrollIntoView({block:'nearest'});
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
