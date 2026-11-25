import {api,el,link,ui} from './ui.js';
export function testActions(level,retake){
  const row=el('div',null,'test-actions');
  const meter=el('progress');
  meter.setAttribute('aria-label','Test preparation');
  const label=el('span','Checking test…');
  label.setAttribute('role','status');
  const preparation=el('div',null,'test-preparation');
  preparation.append(label,meter);
  row.append(preparation);
  async function refresh(){
    if(!row.isConnected)return;
    try{
      const next=await api('/api/milestone-tests/preparation?level='+level);
      if(!row.isConnected)return;
      if(next.attempt){ready(next.attempt);return;}
      if(next.failed){retry();return;}
      meter.max=next.total;meter.value=next.completed;
      label.textContent='Preparing test · '+next.completed+' of '+next.total+' passages ready';
      row.replaceChildren(preparation);
      setTimeout(refresh,1200);
    }catch(error){if(row.isConnected){ui.notice(error.message);retry();}}
  }
  function retry(){
    const b=el('button','Retry preparation');
    b.onclick=()=>{
      label.textContent='Preparing test…';meter.removeAttribute('value');
      row.replaceChildren(preparation);
      void api('/api/milestone-tests',{level}).catch(error=>{if(row.isConnected)ui.notice(error.message);});
      setTimeout(refresh,300);
    };
    row.replaceChildren(el('span','Test preparation failed.'),b);
  }
  function ready(test){
    const start=test.status==='ready';
    const action=retake?(start?'Retake test':'Continue retake'):(start?'Take test':'Continue test');
    row.replaceChildren(link(action,'#/milestone/'+test.id,'button'));
    const remove=el('button','Delete current test');
    remove.onclick=async()=>{
      if(!start&&!window.confirm('Delete this test and its saved answers?'))return;
      remove.disabled=true;
      try{await api('/api/milestone-tests/'+test.id+'/discard',{});await refresh();}
      catch(error){remove.disabled=false;ui.notice(error.message);}
    };
    row.append(remove);
  }
  queueMicrotask(refresh);
  return row;
}
