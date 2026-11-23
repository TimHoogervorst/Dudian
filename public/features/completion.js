import {el,link,api} from '../ui.js';

export function setup(ui) {
  ui.on('reader',async context=>{
    const {story,position,controls}=context;
    const base='/api/stories/'+encodeURIComponent(story.id);
    const state=await api(base+'/completion',undefined,context.signal);
    if(context.signal.aborted)return;
    const finish=el('button','Finish chapter','button');
    const footer=el('div',null,'finish-actions');controls.append(footer);
    function show(result) {
      footer.replaceChildren();
      if(!result.chapters.includes(position.chapter)) {footer.append(finish);return;}
      footer.append(el('span','✓ Chapter finished','completion-state'));
      if(result.finished) {
        if(ui.routes.has('summary'))footer.append(link('Story summary  →','#/summary/'+encodeURIComponent(story.id),'button'));
        else footer.append(link('Reading desk  →','#/home','button'));
      } else {
        const next=story.chapters.findIndex((_,i)=>!result.chapters.includes(i));
        footer.append(link('Continue to '+story.chapters[next].title+'  →','#/read/'+encodeURIComponent(story.id)+'/'+next,'button'));
      }
    }
    finish.onclick=async ()=>{
      finish.disabled=true;
      try{
        await context.flushWordActions?.();
        await context.flushActiveTime?.();
        const result=await api(base+'/complete',{chapter:position.chapter});
        if(context.signal.aborted)return;
        show(result);
        await ui.emit('finished',{...context,completion:result});
        if(result.finished && ui.routes.has('summary'))ui.navigate('/summary/'+encodeURIComponent(story.id));
      }catch(error){ui.notice(error.message);}
      finally{finish.disabled=false;}
    };
    show(state);
  });
}
