import {api,el,link} from '../ui.js';

const portrait='/api/cast/baobao/portrait';
const endpoint=id=>'/api/stories/'+encodeURIComponent(id)+'/art';
export function coverImage(story,className='') {
  const img=el('img',null,'story-illustration '+className);
  img.alt='Cover for '+story.title;
  img.src=endpoint(story.id)+'/image';
  if(story.artStatus==='drawing'){
    async function check(){
      if(!img.isConnected)return;
      try{
        const state=await api(endpoint(story.id)+'/status');
        if(state.status==='drawing')setTimeout(check,2500);
        else if(state.status==='ready'||state.status==='imported')img.src=endpoint(story.id)+'/image?v='+Date.now();
      }catch{if(img.isConnected)setTimeout(check,5000);}
    }
    setTimeout(check,2500);
  }
  return img;
}
function uploadButton(label,url,done){
  const input=el('input');input.type='file';input.accept='image/png,image/webp,image/jpeg';
  input.hidden=true;
  const button=el('button',label);button.type='button';
  const status=el('span');status.setAttribute('role','status');
  button.onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files[0];
    if(!file)return;
    button.disabled=true;
    try{
      const res=await fetch(url,{method:'POST',body:file});
      if(!res.ok)throw Error((await res.json()).error);
      await done();
      status.textContent='Image saved.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=false;input.value='';}
  };
  const wrapper=el('span');wrapper.append(input,button,status);return wrapper;
}
export function showCover(context,story,article) {
  const {root,signal,onLeave}=context;
  const base=endpoint(story.id);
  const image=coverImage(story,'cover-scene');
  const tools=el('details',null,'cover-tools');
  const status=el('p');status.setAttribute('role','status');
  const copy=el('button','Copy illustration prompt');
  const prompt=el('textarea');prompt.value=story.cover.prompt;prompt.readOnly=true;prompt.hidden=true;
  prompt.setAttribute('aria-label','Illustration prompt');
  copy.onclick=async()=>{
    try{await navigator.clipboard.writeText(prompt.value);status.textContent='Prompt copied.';}
    catch{prompt.hidden=false;prompt.focus();prompt.select();status.textContent='Select and copy the illustration prompt.';}
  };
  const download=link('Download 包包 reference',portrait,'text-link');download.download='baobao';
  const retry=el('button','Generate cover');retry.hidden=true;
  let timer;
  onLeave(()=>clearTimeout(timer));
  async function refresh(){
    clearTimeout(timer);
    if(signal.aborted)return;
    const state=await api(base+'/status',undefined,signal);
    if(signal.aborted)return;
    retry.hidden=!state.enabled||!['failed','portrait'].includes(state.status);
    retry.textContent=state.status==='failed'?'Retry illustration':'Generate cover';
    status.textContent=state.error??(state.status==='drawing'?'Drawing the cover…':'');
    if(state.status==='drawing')timer=setTimeout(()=>refresh().catch(report),2200);
    else if(['imported','ready'].includes(state.status))image.src=base+'/image?v='+Date.now();
  }
  function report(error){if(!signal.aborted)status.textContent=error.message;}
  retry.onclick=async()=>{
    retry.disabled=true;
    try{await api(base+'/retry',{});await refresh();}catch(error){report(error);}finally{retry.disabled=false;}
  };
  tools.append(el('summary','Cover artwork'),copy,...(story.cover.reference===false?[]:[download]),uploadButton('Import cover',base+'/image',refresh),retry,prompt);
  const controls=el('div',null,'cover-reading-actions');
  controls.append(link('Start reading','#/read/'+encodeURIComponent(story.id),'button'),tools);
  root.append(image,article,controls,status);
  refresh().catch(report);
}
export function setup(ui){
  ui.route('cast',({root})=>{
    const img=el('img',null,'cast-portrait');img.src=portrait;img.alt='包包 with a green crossbody satchel';
    root.append(link('← Library','#/library','text-link'),el('h1','Meet the cast'),img,el('h2','包包 · Bāobāo'),
      el('p','Our little steamed-bun friend carries a green satchel and finds adventures in everyday life.'));
  });
  ui.on('settings',async({root,signal})=>{
    const saved=await api('/api/art-settings',undefined,signal);
    const section=el('section',null,'story-settings');
    const enabled=el('input');enabled.type='checkbox';enabled.checked=saved.enabled;
    const label=el('label');label.append(enabled,' Generate a cover automatically for each new story');
    const provider=el('select');
    for(const [value,text] of [['subscription','ChatGPT subscription (Codex)'],['api','OpenAI API (separately billed)']]){
      const option=el('option',text);option.value=value;provider.append(option);
    }
    provider.value=saved.provider;
    const providerLabel=el('label','Cover generation');providerLabel.append(provider);
    function modelField(name,values,selected){
      const label=el('label',name),select=el('select');
      for(const value of new Set([...values,selected])){
        const option=el('option',value||'Codex default');option.value=value;select.append(option);
      }
      select.value=selected;label.append(select);return {label,select};
    }
    const image=modelField('Image model',saved.imageModels,saved.apiModel);
    const codex=modelField('Codex cover model',['',...saved.codexModels],saved.codexModel);
    const hint=el('p','Codex uses this model to direct its built-in image tool.');
    const key=el('input');key.type='password';key.autocomplete='off';
    key.placeholder=saved.configured?'Saved key':'OpenAI image API key';
    const keyLabel=el('label','Image API key');keyLabel.append(key);
    const form=el('form');const save=el('button','Save artwork settings');
    const status=el('p');status.setAttribute('role','status');
    const connection=el('p',saved.workerOnline?'Subscription cover worker is online.':'Subscription cover worker is offline. Start the worker on your Docker host.');
    function fields(){
      const paid=provider.value==='api';
      keyLabel.hidden=image.label.hidden=!paid;
      connection.hidden=codex.label.hidden=hint.hidden=paid;
    }
    provider.onchange=fields;fields();
    form.append(providerLabel,connection,codex.label,hint,image.label,label,keyLabel,save,status);
    form.onsubmit=async event=>{
      event.preventDefault();save.disabled=true;
      try{
        const result=await api('/api/art-settings',{provider:provider.value,enabled:enabled.checked,key:provider.value==='api'?key.value:undefined,
          apiModel:image.select.value,codexModel:codex.select.value});
        key.value='';if(result.configured)key.placeholder='Saved key';
        status.textContent='Artwork settings saved.';
      }catch(error){status.textContent=error.message;}finally{save.disabled=false;}
    };
    section.append(el('h2','Story artwork'),form,uploadButton('Replace 包包 reference portrait',portrait,()=>{}));
    root.append(section);
  });
}
