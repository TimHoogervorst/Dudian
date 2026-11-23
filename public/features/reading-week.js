import {el,api} from '../ui.js';

// Limit unattended foreground time. Continued interaction extends the reading window.
const attentiveFor=45000;
export function setup(ui) {
  let stop;
  ui.on('leave',async ()=>{if(stop){const cleanup=stop;stop=undefined;await cleanup();}});
  ui.on('reader',context=>{
    const {story,position}=context;
    const chapter=position.chapter;
    const controller=new AbortController();
    let cursor=performance.now(),lastInput=cursor,engaged=!document.hidden&&document.hasFocus();
    let accrued=0;
    const writes=new Set();
    function advance(){
      const now=performance.now();
      if(engaged)accrued+=Math.max(0,Math.min(now,lastInput+attentiveFor)-cursor);
      cursor=now;
    }
    function flush(){
      advance();
      const duration=Math.min(30000,Math.floor(accrued));accrued=0;
      if(duration<=0)return Promise.all(writes);
      const request=fetch('/api/reading-interval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId:story.id,chapter,duration}),keepalive:true})
        .then(response=>{if(!response.ok)throw Error('Could not record reading time.');});
      writes.add(request);request.then(()=>writes.delete(request),()=>writes.delete(request));
      return Promise.all(writes);
    }
    const options={passive:true,signal:controller.signal};
    function input(){advance();lastInput=cursor;}
    function visibility(){
      advance();engaged=!document.hidden&&document.hasFocus();
      if(engaged)lastInput=cursor;
      else flush().catch(e=>ui.notice(e.message));
    }
    for(const event of ['pointerdown','keydown','scroll','wheel','touchmove'])window.addEventListener(event,input,{...options,capture:true});
    window.addEventListener('focus',visibility,options);
    window.addEventListener('blur',visibility,options);
    document.addEventListener('visibilitychange',visibility,options);
    window.addEventListener('pagehide',()=>flush().catch(()=>{}),options);
    const timer=setInterval(()=>flush().catch(e=>ui.notice(e.message)),10000);
    context.flushActiveTime=flush;
    stop=async ()=>{clearInterval(timer);controller.abort();await flush().catch(e=>ui.notice(e.message));};
  });
  ui.on('home',async ({root})=>{
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const week=await api('/api/reading-week?zone='+encodeURIComponent(zone));
    const panel=root.querySelector('.home-week')??el('section',null,'home-week');
    const days=el('ol',null,'week-days');
    const weekday=new Intl.DateTimeFormat(undefined,{weekday:'short',timeZone:'UTC'});
    const labels={empty:'No reading',light:'Read',full:'Finished a story'};
    for(const day of week.days){
      const name=weekday.format(new Date(day.date+'T12:00:00Z'));
      const li=el('li',null,'week-'+day.state);
      const circle=el('span',null,'day-circle');circle.setAttribute('aria-hidden','true');
      li.setAttribute('aria-label',day.date+' · '+labels[day.state]);li.title=labels[day.state];
      if(day.date===week.today)li.setAttribute('aria-current','date');
      li.append(circle,el('span',name));days.append(li);
    }
    panel.replaceChildren(el('h2','This week'),days,el('p',week.finished+' '+(week.finished===1?'story':'stories')+' finished','week-total'));
    if(!panel.isConnected)root.append(panel);
  });
}

