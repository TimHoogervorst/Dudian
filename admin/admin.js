import {focusDeck} from './focus-deck.js';
import {icon} from '/icons.js';
const main=document.querySelector('main'), nav=document.querySelector('nav'), logout=document.querySelector('#logout'), notice=document.querySelector('#notice');
const tokenKey='dudian.admin.token';
const pages=['Overview','Users','Characters','Stories','Settings'];
let data,revision=0,timer,cohort='active';
function el(tag,text,cls){
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
}
function button(text,action,cls){
  const b=el('button',text,cls);b.type='button';
  b.onclick=()=>Promise.resolve().then(action).catch(report);return b;
}
function report(e){notice.textContent=e.message;}
function field(name,control){const label=el('label',name);label.append(control);return label;}
function select(values,chosen){
  const input=el('select');
  for(const [v,label] of values){const o=el('option',label);o.value=v;input.append(o);}
  if(chosen!==undefined)input.value=chosen;
  return input;
}
function input(type,value){const n=el('input');n.type=type;n.value=value??'';return n;}
function metric(label,value){const box=el('div',undefined,'metric');box.append(el('small',label),el('strong',value));return box;}
function link(text,hash){const a=el('a',text);a.href='#'+hash;return a;}
async function api(path,payload){
  const token=sessionStorage.getItem(tokenKey);
  const headers=token?{Authorization:'Bearer '+token}:{};
  const upload=payload instanceof Blob;
  if(payload!==undefined&&!upload)headers['Content-Type']='application/json';
  const response=await fetch('/api/'+path,{method:payload===undefined?'GET':'POST',headers,body:upload?payload:JSON.stringify(payload)});
  const result=await response.json();
  if(response.status===401 && token){sessionStorage.removeItem(tokenKey);data=null;render();}
  if(!response.ok)throw Error(result.error||'Request failed.');
  return result;
}
function formAction(form,action){
  form.onsubmit=async event=>{
    event.preventDefault();notice.textContent='';
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{await action();}catch(e){report(e);}finally{submit.disabled=false;}
  };
}
function submit(text){const b=el('button',text,'primary');b.type='submit';return b;}
function signIn(){
  main.replaceChildren(el('h1','Admin sign-in'));
  const form=el('form',undefined,'signin'),name=input('text'),password=input('password');
  name.required=password.required=true;name.autocomplete='username';password.autocomplete='current-password';
  form.append(field('Administrator',name),field('Password',password),submit('Sign in'));main.append(form);
  formAction(form,async()=>{
    const {token}=await api('login',{username:name.value,password:password.value});
    sessionStorage.setItem(tokenKey,token);await render();
  });
}
logout.onclick=async()=>{try{await api('logout',{});}finally{sessionStorage.removeItem(tokenKey);data=null;await render();}};
const account=document.querySelector('.account-menu');
account.querySelector('summary').append(icon('person'));
document.querySelector('#settings-link').prepend(icon('settings'));
logout.prepend(icon('logout'));
document.addEventListener('pointerdown',event=>{if(!account.contains(event.target))account.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&account.open){account.open=false;account.querySelector('summary').focus();}});
document.querySelector('.skip').onclick=event=>{event.preventDefault();main.focus();};
for(const [page,mark] of [['Overview','flag'],['Users','person'],['Characters','dictionary'],['Stories','book']]){
  const tab=link(page,page.toLowerCase());tab.prepend(icon(mark));nav.append(tab);
}
function overview(){
  const segment=select([['active','Active in the past 30 days'],['all','All learners']],cohort);
  const panel=el('section');main.append(field('Chart population',segment),panel);
  function draw(){
    cohort=segment.value;const pop=data[cohort],metrics=el('div',undefined,'metrics');
    metrics.append(metric('Registered learners',data.all.count),metric('Active · 30 days',data.active.count),metric('Mean HSK progress',pop.count?pop.progress.toFixed(2):'—'));
    panel.replaceChildren(metrics,el('h2','HSK level distribution'));
    const chart=el('div',undefined,'chart'),max=Math.max(1,...pop.levels);
    pop.levels.forEach((count,i)=>{
      const row=el('div',undefined,'bar'),label=i===6?'Completed HSK 6':'Toward HSK '+(i+1);
      const meter=el('meter');meter.min=0;meter.max=max;meter.value=count;meter.setAttribute('aria-label',label);
      row.append(el('span',label),meter,el('strong',count));chart.append(row);
    });panel.append(chart);
    if(!pop.count)panel.append(el('p','No learners in this population yet.','empty'));
  }
  segment.onchange=draw;draw();
}
function browse(items,make,container,pageSize=48){
  let page=0;
  const results=el('div'),controls=el('div',undefined,'controls');
  function draw(){
    results.replaceChildren(...items.slice(page*pageSize,(page+1)*pageSize).map(make));
    results.className=container.dataset.grid?'grid':'';
    const prev=button('Previous',()=>{page--;draw();}),next=button('Next',()=>{page++;draw();});
    prev.disabled=!page;next.disabled=(page+1)*pageSize>=items.length;
    controls.replaceChildren(el('span',items.length?'Showing '+(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,items.length)+' of '+items.length:'No matches.'));
    if(items.length>pageSize)controls.append(prev,next);
  }
  container.replaceChildren(results,controls);draw();
}
function characters(selected){
  const detail=el('section',undefined,'sheet detail');detail.hidden=true;
  const search=input('search'),band=select([['','All HSK levels'],...levels()]),results=el('div');results.dataset.grid='yes';
  const controls=el('div',undefined,'controls');controls.append(field('Search character, pinyin or meaning',search),field('HSK level',band));
  main.append(detail,controls,results);
  function open(c){
    detail.hidden=false;const list=data.stories.filter(s=>s.focus.includes(c.text));
    detail.replaceChildren(el('span',c.text,'glyph'),el('strong',c.pinyin+' · HSK '+c.level),el('p',c.meaning),
      el('p',c.scored?'Average strength '+c.average.toFixed(2)+' · '+c.scored+' of '+data.all.count+' learners scored':'No recorded scores · '+data.all.count+' registered learners'),
      el('h3','Stories focused on '+c.text));
    if(!list.length)detail.append(el('p','No catalog stories focus on this character.'));
    for(const story of list)detail.append(storyRow(story));
    detail.scrollIntoView({block:'nearest'});
  }
  const normalize=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function draw(){
    const q=normalize(search.value.trim());
    browse(data.characters.filter(c=>(!band.value||c.level===Number(band.value))&&normalize([c.text,c.pinyin,c.meaning].join(' ')).includes(q)),c=>{
      const tile=button('',()=>open(c),'tile');tile.append(el('strong',c.text),el('small',c.pinyin),el('small',c.stories+' stories'));return tile;
    },results);
  }
  search.oninput=band.onchange=draw;draw();
  const c=data.characters.find(c=>c.text===selected);if(c)open(c);
}
function upload(label,path){
  const file=input('file');file.accept='image/png,image/jpeg,image/webp';
  file.onchange=async()=>{
    if(!file.files.length)return;
    try{await api(path,file.files[0]);notice.textContent='Image saved.';}catch(e){report(e);}
  };
  return field(label,file);
}
function levels(){return Array.from({length:6},(_,i)=>[String(i+1),'HSK '+(i+1)]);}
function storyRow(s){
  const row=el('div',undefined,'row');row.append(link(s.title,'story/'+encodeURIComponent(s.id)),el('small',(s.band&&s.band<=6?'HSK '+s.band:'Unclassified')+' · '+(s.difficulty??'difficulty unknown')+' · '+(s.focus.join(' ')||'no recorded focus')));return row;
}
function storyChoices(title,name,options,selected){
  const group=el('fieldset'),cards=el('div',undefined,'choice-grid');
  group.append(el('legend',title),cards);
  for(const [value,label,mark] of options){
    const radio=input('radio',value);
    radio.name=name;radio.checked=value===selected;
    const card=el('label',undefined,'choice-card');
    card.append(radio);
    if(mark)card.append(icon(mark));
    card.append(el('span',label),el('span','✓','choice-check'));
    cards.append(card);
  }
  return group;
}
async function stories(version){
  const top=data.suggestions[0];
  const form=el('form',undefined,'story-options catalog-builder');
  const deck=focusDeck();
  const character=input('text');
  character.lang='zh-Hans';character.autocomplete='off';
  const band=select(levels(),String(top?.band??1));
  const types=storyChoices('Reading type','type',[
    ['book','Book','book'],['article','Article','newspaper'],['dialogue','Dialogue','conversation']
  ],'book');
  const difficultyGroup=storyChoices('Difficulty','difficulty',[
    ['easy','Easy','easy'],['medium','Medium','medium'],['hard','Hard','hard']
  ],top?.difficulty??'easy');
  const chapters=input('range','1');
  chapters.min='1';chapters.max='6';chapters.id='story-length';
  const lengthLabel=el('label','Story length');lengthLabel.htmlFor=chapters.id;
  const length=el('fieldset',undefined,'story-length'),lengthValue=el('output');
  lengthValue.htmlFor.add(chapters.id);length.append(lengthLabel,lengthValue,chapters);
  const subjectSlot=el('div'),focusOptions=el('div',undefined,'focus-options');
  const focus=el('fieldset');focus.append(el('legend','Character focus'),el('p','All cards start selected. Toggle a card to leave it out, or use ↻ to replace it.','focus-note'),focusOptions);
  const overrides=el('div',undefined,'controls');overrides.append(field('Custom character',character),button('Include character',includeCustom),field('Audience',band));
  const plan=el('aside',undefined,'sheet plan-preview');
  plan.setAttribute('aria-label','Story preview');
  const jobList=el('section'),choices=el('div'),catalog=el('section'),ranks=el('details');
  ranks.append(el('summary','Browse ranked suggestions ('+data.suggestions.length+')'),choices);
  const generate=submit('Generate story');generate.append(icon('arrow'));
  form.append(types,difficultyGroup,length,subjectSlot,focus,overrides,ranks,generate);
  const layout=el('div',undefined,'practice-layout');layout.append(form,plan);
  main.append(el('h2','Create a story'),layout,el('h2','Recent generation'),jobList,el('h2','Catalog coverage'),catalog);
  let requestId=crypto.randomUUID(),previousBand;
  const entryByText=new Map(data.characters.map(c=>[c.text,c]));
  const difficulty=()=>form.elements.namedItem('difficulty').value;

  function updateSubjects(){
    if(previousBand===band.value)return;
    previousBand=band.value;
    const previous=form.elements.namedItem('subject')?.value??'';
    const available=data.subjects.filter(s=>s.level<=Number(band.value)).sort((a,b)=>b.level-a.level).slice(0,5);
    const options=[['','Any subject'],...available.map(s=>[s.zh,s.zh+' · '+s.en])];
    const group=storyChoices('Subject','subject',options,available.some(s=>s.zh===previous)?previous:'');
    group.lastChild.className='topic-options';
    subjectSlot.replaceChildren(group);
  }
  function preview(){
    requestId=crypto.randomUUID();updateSubjects();
    lengthValue.value=chapters.value+(chapters.value==='1'?' chapter':' chapters');
    chapters.setAttribute('aria-valuetext',lengthValue.value);
    const audience=Number(band.value),task=difficulty();
    const matching=data.suggestions.filter(s=>s.band===audience&&s.difficulty===task);
    const demand=new Map(matching.map(s=>[s.character,s]));
    const bandDemand=new Map();
    for(const suggestion of data.suggestions){
      if(suggestion.band===audience)bandDemand.set(suggestion.character,(bandDemand.get(suggestion.character)??0)+suggestion.total);
    }
    const curriculum=data.characters.filter(c=>c.level<=audience).sort((a,b)=>
      (bandDemand.get(b.text)??0)-(bandDemand.get(a.text)??0)||a.stories-b.stories||Number(b.level===audience)-Number(a.level===audience));
    const ranked=[...new Set([...demand.keys(),...curriculum.map(c=>c.text)])];
    const limit=data.focusBudgets[task][Number(chapters.value)-1];
    const cards=deck.fill(audience+'/'+task,ranked,limit);
    const previousFocus=document.activeElement?.dataset.focusControl;
    focusOptions.replaceChildren(...cards.map(({text,selected},index)=>{
      const item=entryByText.get(text),suggestion=demand.get(text);
      const card=el('article',undefined,'focus-card focus-slot');
      const toggle=el('button',undefined,'focus-toggle');
      toggle.type='button';toggle.dataset.focusControl='toggle-'+index;
      toggle.setAttribute('aria-label','Include '+text);toggle.setAttribute('aria-pressed',String(selected));
      toggle.onclick=()=>{deck.toggle(index);preview();};
      const glyph=el('strong',text);glyph.lang='zh-Hans';
      toggle.append(glyph,el('span',item.pinyin),el('small',item.meaning));
      const refresh=el('button','↻','focus-reroll');refresh.type='button';
      refresh.dataset.focusControl='reroll-'+index;refresh.title='Reroll '+text;
      refresh.setAttribute('aria-label',refresh.title);refresh.disabled=!deck.canReroll();
      refresh.onclick=()=>{deck.reroll(index);preview();};
      const evidence=suggestion?suggestion.review+' review · '+suggestion.first+' first exposure':
        bandDemand.has(text)?bandDemand.get(text)+' need practice across difficulties':item.stories+' catalog '+(item.stories===1?'story':'stories');
      card.append(toggle,refresh,el('small',evidence));return card;
    }));
    if(previousFocus)focusOptions.querySelector('[data-focus-control="'+previousFocus+'"]')?.focus({preventScroll:true});
    const selected=deck.selected();
    generate.disabled=!selected.length;
    const subject=form.elements.namedItem('subject').value;
    const readingType=form.elements.namedItem('type').value;
    plan.replaceChildren(el('h3','Story preview'),el('p',[readingType,difficulty(),'HSK '+audience,lengthValue.value,subject].filter(Boolean).join(' · '),'plan-format'));
    plan.append(el('h4','Requested focus · '+selected.length+' of '+limit));
    const targets=el('div',undefined,'background-cards');
    for(const text of selected){
      const tile=el('span'),glyph=el('b',text);glyph.lang='zh-Hans';
      tile.append(glyph,el('small',entryByText.get(text).pinyin));targets.append(tile);
    }
    plan.append(selected.length?targets:el('p','Select at least one focus card.'));
    plan.append(el('h4','Available background vocabulary'));
    const background=el('div',undefined,'background-cards');
    for(const char of data.background.filter(c=>!selected.includes(c))){
      const tile=el('span'),item=entryByText.get(char);
      const glyph=el('b',char);glyph.lang='zh-Hans';tile.append(glyph,el('small',item?.pinyin));tile.title=item?.meaning??char;background.append(tile);
    }
    plan.append(background,el('p','The finished story is credited for the characters it actually practices.','focus-note'));
  }
  function choose(s){
    band.value=String(s.band);form.elements.namedItem('difficulty').value=s.difficulty;
    preview();deck.include(s.character);preview();plan.scrollIntoView({block:'nearest'});
  }
  function includeCustom(){
    const text=character.value.trim(),item=entryByText.get(text);
    if(!item||item.level>Number(band.value)){report(Error('Choose a dictionary character within the selected HSK band.'));return;}
    deck.include(text);character.value='';notice.textContent='';preview();
  }
  character.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();includeCustom();}};
  form.oninput=event=>{if(event.target!==character)preview();};preview();
  browse(data.suggestions,s=>{
    const row=el('div',undefined,'row');row.append(el('strong',s.character),el('span','HSK '+s.band+' · '+s.difficulty),el('small',s.review+' review · '+s.first+' first exposure'),button('Include suggestion',()=>choose(s)));return row;
  },choices,10);
  const filter=select([['all','All characters'],['gaps','No focus stories'],['covered','Has focus stories']]),coverage=el('div'),library=el('details'),titles=el('div');
  const audience=select([['','All HSK bands'],...levels()]),task=select([['','All difficulties'],...['easy','medium','hard'].map(v=>[v,v])]);
  const filters=el('div',undefined,'controls');filters.append(field('Coverage',filter),field('Story audience',audience),field('Story difficulty',task));
  library.append(el('summary','Browse catalog stories'),titles);catalog.append(filters,coverage,library);
  function coverageTable(){
    const matching=data.stories.filter(s=>(!audience.value||s.band===Number(audience.value))&&(!task.value||s.difficulty===task.value));
    const counts=new Map();
    for(const story of matching)for(const c of story.focus)counts.set(c,(counts.get(c)??0)+1);
    const chars=data.characters.filter(c=>(!audience.value||c.level<=Number(audience.value))&&(filter.value==='all'||(filter.value==='covered')===counts.has(c.text)));
    chars.sort((a,b)=>(counts.get(b.text)??0)-(counts.get(a.text)??0));
    browse(chars,c=>{const row=el('div',undefined,'row');row.append(link(c.text,'characters/'+encodeURIComponent(c.text)),el('span',c.pinyin),el('small',(counts.get(c.text)??0)+' focus stories'));return row;},coverage,12);
    browse(matching,storyRow,titles,12);
  }
  filter.onchange=audience.onchange=task.onchange=coverageTable;coverageTable();
  async function jobs(){
    const rows=await api('jobs');if(version!==revision)return;
    jobList.replaceChildren();
    if(!rows.length)jobList.append(el('p','No catalog generation requests yet.','empty'));
    for(const j of rows){
      const row=el('div',undefined,'row');row.append(el('strong',j.stage),el('span','Requested '+(j.request.characters??[j.request.character]).join(' · ')));
      if(j.story_id)row.append(link(j.title,'story/'+j.story_id),el('span','Verified '+j.focus.map(c=>c.text).join(' ')));
      if(j.error)row.append(el('span',j.error));jobList.append(row);
    }
    if(rows.some(j=>j.story_id&&!data.stories.some(story=>story.id===j.story_id))){
      data=null;await render();return;
    }
    clearTimeout(timer);
    if(rows.some(j=>!['published','failed'].includes(j.stage)))timer=setTimeout(()=>jobs().catch(report),1500);
    else if(jobList.dataset.waiting){data=null;await render();}
    jobList.dataset.waiting=rows.some(j=>!['published','failed'].includes(j.stage))?'yes':'';
  }
  formAction(form,async()=>{await api('jobs',{id:requestId,characters:deck.selected(),band:Number(band.value),difficulty:difficulty(),type:form.elements.namedItem('type').value,chapterCount:Number(chapters.value),subject:form.elements.namedItem('subject').value});requestId=crypto.randomUUID();await jobs();});
  await jobs();
}
async function render(){
  const version=++revision;clearTimeout(timer);notice.textContent='';
  const signed=!!sessionStorage.getItem(tokenKey);nav.hidden=account.hidden=!signed;account.open=false;
  if(!signed){signIn();return;}
  const [page='overview',part]=(location.hash.slice(1)||'overview').split('/');
  for(const a of nav.children){if(a.hash==='#'+(page==='story'?'stories':page))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  const title=pages.find(p=>p.toLowerCase()===page)??'Story';
  main.replaceChildren(el('h1',title),el('p','Loading…'));document.title=title+' · Dudian';
  try{
    if(['overview','characters','stories'].includes(page)&&!data){const latest=await api('insights');if(version!==revision)return;data=latest;}
    if(version!==revision)return;
    const heading=el('div',undefined,'page-heading');heading.append(el('h1',title));main.replaceChildren(heading);
    if(['overview','characters','stories'].includes(page))heading.append(button('Refresh data',async()=>{data=null;await render();}));
    if(page==='overview')overview();
    else if(page==='characters')characters(decodeURIComponent(part??''));
    else if(page==='stories')await stories(version);
    else if(page==='users'){
      const users=await api('users');if(version!==revision)return;
      const search=input('search'),list=el('section');main.append(field('Find a username',search),list);
      const draw=()=>browse(users.filter(u=>u.username.toLowerCase().includes(search.value.toLowerCase())),u=>el('div',u.username,'row'),list);
      search.oninput=draw;draw();
    }else if(page==='story'){
      const s=await api('story?id='+encodeURIComponent(part));if(version!==revision)return;
      main.replaceChildren(link('← Stories','stories'),el('h1',s.title));
      if(s.cover){
        const art='stories/'+encodeURIComponent(s.id)+'/art';
        const tools=el('details'),prompt=el('textarea');prompt.readOnly=true;prompt.value=s.cover.prompt;
        const state=await api(art+'/status');if(version!==revision)return;
        tools.append(el('summary','Cover artwork'),field('Illustration prompt',prompt),el('p',state.error??state.status),
          upload('Import cover',art+'/image'),button('Generate or retry cover',async()=>{await api(art+'/retry',{});notice.textContent='Cover request accepted.';}));
        if(s.cover.reference!==false)tools.append(button('Download reference portrait',async()=>{
          const r=await fetch('/api/cast/baobao/portrait',{headers:{Authorization:'Bearer '+sessionStorage.getItem(tokenKey)}});
          if(!r.ok)throw Error('Portrait unavailable.');
          const url=URL.createObjectURL(await r.blob()),a=el('a');a.href=url;a.download='baobao';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }));
        main.append(tools);
      }
      for(const c of s.chapters){main.append(el('h2',c.title));for(const p of c.paragraphs)main.append(el('p',p.map(t=>t.text).join('')));}
    }else if(page==='settings'){
      const status=await api('provider/status');if(version!==revision)return;
      const signin=el('a','Connect catalog AI');signin.href=status.hostSignIn;signin.target='_blank';signin.rel='noreferrer';
      main.append(el('h2','Catalog AI connection'),el('p',status.connected?'Connected':'Awaiting sign-in'),signin);
      if(status.connected){
        const models=await api('provider/models');if(version!==revision)return;
        const model=select([...new Set(['',...models.models,models.selected])].map(v=>[v,v||'Automatic']),models.selected);
        main.append(field('Text model',model),button('Save text model',async()=>{await api('provider/models',{model:model.value});notice.textContent='Text model saved.';}),
          button('Try a short passage',async()=>{const result=await api('provider/passage',{});notice.textContent=result.entries.map(e=>e.text).join('');}));
      }
      const arts=await api('art-settings');if(version!==revision)return;
      const form=el('form'),enabled=input('checkbox');enabled.checked=arts.enabled;
      const provider=select([['subscription','Subscription worker'],['api','Paid API']],arts.provider),key=input('password');
      const imageModel=select(arts.imageModels.map(v=>[v,v]),arts.apiModel),codex=select([...new Set(['',...arts.codexModels,arts.codexModel])].map(v=>[v,v||'Default']),arts.codexModel);
      form.append(field('API image model',imageModel),field('Subscription cover model',codex));
      form.append(field('Automatic covers',enabled),field('Artwork provider',provider),field('New API key (optional)',key),submit('Save artwork settings'));
      main.append(el('h2','Cover artwork'),el('p',arts.workerOnline?'Cover worker online':'Cover worker offline'),form,upload('Replace reference portrait','cast/baobao/portrait'));
      formAction(form,async()=>{await api('art-settings',{enabled:enabled.checked,provider:provider.value,key:key.value,apiModel:imageModel.value,codexModel:codex.value});key.value='';notice.textContent='Artwork settings saved.';});
    }else main.append(link('Open overview','overview'));
  }catch(e){if(version===revision)report(e);}
}
window.addEventListener('hashchange',render);render();
