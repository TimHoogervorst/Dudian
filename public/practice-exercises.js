import {api,el,link,ui} from './ui.js';

function written(item){
  const glyph=el('strong',item.text,'practice-glyph');
  glyph.lang='zh-Hans';
  const label=el('span',null,'practice-reading');
  label.append(glyph,el('span',item.pinyin,'recall-pinyin'));
  return label;
}
export function choicePrompt(card,exercise,listen){
  card.append(written(exercise.targets[0]));
  if(listen)card.append(listen);
  if(exercise.example){
    const {before,target,after}=exercise.example;
    const sentence=el('p',null,'recall-example');sentence.lang='zh-Hans';
    sentence.append(before,el('mark',target),after);
    card.append(sentence);
  }
}

function choice(card,exercise,submit){
  const item=exercise.targets[0];
  let listen;
  const voice=window.speechSynthesis?.getVoices().find(v=>v.localService&&/^(?:cmn|zh(?:[-_](?:CN|SG|Hans)|$))/i.test(v.lang));
  if(voice){
    listen=el('button','Listen','recall-example-button');
    listen.onclick=()=>{
      const speech=new SpeechSynthesisUtterance(item.text);
      speech.voice=voice;speech.lang=voice.lang;
      window.speechSynthesis.speak(speech);
    };
  }
  choicePrompt(card,exercise,listen);
  const grid=el('div',null,'practice-options');
  exercise.options.forEach((meaning,index)=>{
    const button=el('button',meaning);
    button.onclick=()=>submit([index]);
    grid.append(button);
  });
  card.append(grid);
  return ([result])=>{
    for(const button of grid.children){
      if(button.textContent===result.meaning)mark(button,result.correct?'correct':'answer');
      else if(button.textContent===result.chosen)mark(button,'miss');
    }
    return result.correct?'Correct':'Incorrect. The answer is '+result.meaning+'.';
  };
}

function mark(button,state){
  button.dataset.result=state;
  button.prepend(el('span',state==='miss'?'× ':'✓ ','practice-mark'));
}
export function matching(card,exercise,submit,draft){
  const board=el('div',null,'practice-board');
  const rows=el('div',null,'practice-pairs');
  const bank=el('div',null,'practice-bank');
  const check=el('button','Check','button');
  const cards=[],slots=[],homes=[],empty=[];
  let selected=null;
  function select(tile){
    selected?.setAttribute('aria-pressed','false');
    selected=tile;
    selected?.setAttribute('aria-pressed','true');
  }
  function place(tile,slot){
    if(!tile||card.disabled)return;
    const from=tile.parentElement;
    const displaced=slot.querySelector('.meaning-card');
    if(displaced===tile){select(null);return;}
    const before=tile.getBoundingClientRect();
    if(displaced){
      const home=homes[cards.indexOf(displaced)];
      (slots.includes(from)?from:home).append(displaced);
    }
    slot.append(tile);
    empty.forEach((button,i)=>button.hidden=!!slots[i].querySelector('.meaning-card'));
    select(null);
    check.disabled=empty.some(button=>!button.hidden);
    draft?.change(slots.map(slot=>cards.indexOf(slot.querySelector('.meaning-card'))));
    tile.focus({preventScroll:true});
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const after=tile.getBoundingClientRect();
      tile.animate([{transform:'translate('+(before.left-after.left)+'px,'+(before.top-after.top)+'px)'},{transform:'none'}],{duration:180,easing:'ease-out'});
    }
  }
  exercise.targets.forEach((item,i)=>{
    const row=el('div',null,'practice-pair');
    const slot=el('div',null,'practice-slot');
    const button=el('button','＋','empty-slot');
    button.setAttribute('aria-label','Place meaning for '+item.text);
    button.onclick=()=>place(selected,slot);
    slot.append(button);slots.push(slot);empty.push(button);
    row.append(written(item),slot);rows.append(row);
  });
  exercise.options.forEach((meaning,i)=>{
    const home=el('div',null,'meaning-home');
    const tile=el('button',meaning,'meaning-card');
    tile.setAttribute('aria-pressed','false');
    tile.onclick=()=>{
      if(selected&&selected!==tile&&slots.includes(tile.parentElement))place(selected,tile.parentElement);
      else select(selected===tile?null:tile);
    };
    tile.draggable=true;
    tile.ondragstart=event=>{
      if(card.disabled){event.preventDefault();return;}
      select(tile);event.dataTransfer.setData('text/plain',String(i));event.dataTransfer.effectAllowed='move';
    };
    tile.ondragend=()=>{select(null);slots.forEach(slot=>slot.classList.remove('over'));};
    // Touch browsers vary in native drag support. Track the finger over the same slots.
    let origin,ghost,hover,suppressClick=false;
    tile.addEventListener('click',event=>{
      if(suppressClick){event.stopImmediatePropagation();suppressClick=false;}
    },true);
    tile.onpointerdown=event=>{
      if(event.pointerType==='mouse'||card.disabled)return;
      suppressClick=false;
      origin={x:event.clientX,y:event.clientY};
      tile.setPointerCapture(event.pointerId);
    };
    tile.onpointermove=event=>{
      if(!origin)return;
      if(!ghost&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)<7)return;
      if(!ghost){
        ghost=tile.cloneNode(true);ghost.classList.add('drag-preview');
        ghost.setAttribute('aria-hidden','true');ghost.style.width=tile.offsetWidth+'px';
        document.body.append(ghost);select(tile);
      }
      ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
      hover?.classList.remove('over');
      hover=document.elementFromPoint(event.clientX,event.clientY)?.closest('.practice-slot');
      if(slots.includes(hover))hover.classList.add('over');
    };
    function finish(event){
      if(ghost){
        suppressClick=true;
        if(event.type==='pointerup'&&slots.includes(hover))place(tile,hover);
        hover?.classList.remove('over');ghost.remove();select(null);
      }
      origin=ghost=hover=null;
    }
    tile.onpointerup=tile.onpointercancel=finish;
    cards.push(tile);homes.push(home);home.append(tile);bank.append(home);
  });
  slots.forEach(slot=>{
    slot.ondragover=event=>{if(selected&&!card.disabled){event.preventDefault();slot.classList.add('over');}};
    slot.ondragleave=event=>{if(!slot.contains(event.relatedTarget))slot.classList.remove('over');};
    slot.ondrop=event=>{event.preventDefault();slot.classList.remove('over');place(selected,slot);};
  });
  check.disabled=true;
  check.onclick=()=>{select(null);submit(slots.map(slot=>cards.indexOf(slot.querySelector('.meaning-card'))));};
  board.append(rows,bank);
  card.append(el('p','Drag each meaning into its slot, or select a card and then a slot.'),board,check);
  if(draft){
    check.remove();
    draft.answers.forEach((answer,i)=>{if(answer>=0){slots[i].append(cards[answer]);empty[i].hidden=true;}});
  }
  return feedback=>{
    check.hidden=true;
    feedback.forEach((result,i)=>{
      const tile=slots[i].querySelector('.meaning-card');
      mark(tile,result.correct?'correct':'miss');
      if(!result.correct)slots[i].append(el('strong','✓ '+result.meaning,'match-correction'));
    });
    return feedback.filter(row=>row.correct).length+' of '+feedback.length+' correct';
  };
}
const formats={
  choice:{title:'Choose the English meaning',render:choice},
  match:{title:'Match the meanings',render:matching}
};
export function drawPractice(root,session,summary){
  root.replaceChildren();
  if(!session.exercise){summary(root,session);return;}
  const header=el('header',null,'card-heading');
  header.append(link('← Library','#/library','text-link'));
  const card=el('section',null,'recall-card practice-exercise');
  const format=formats[session.exercise.type];
  const counter=el('p','Exercise '+(session.index+1)+' of '+session.total,'overline');
  const progress=el('progress',null,'practice-progress');
  progress.setAttribute('aria-label','Exercises completed');
  progress.max=session.total;
  progress.value=session.index;
  const title=el('h1',format.title);
  title.tabIndex=-1;
  card.append(counter,progress,title);
  root.append(header,card);
  title.focus();
  const controls=el('fieldset',null,'practice-controls');
  controls.setAttribute('aria-label',format.title);
  card.append(controls);
  const status=el('p',null,'practice-status');
  status.setAttribute('role','status');
  card.append(status);
  async function submit(answers){
    if(controls.disabled)return;
    controls.disabled=true;
    try{
      const {feedback,next}=await api('/api/practice/sets/'+session.id+'/submit',{
        index:session.index,answers,zone:Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      if(!card.isConnected)return;
      progress.value=next.index;
      status.textContent=showResult(feedback);
      const missed=feedback.some(row=>!row.correct);
      const delay=missed?(feedback.length>1?3200:1650):850;
      setTimeout(()=>{if(card.isConnected)drawPractice(root,next,summary);},delay);
    }catch(error){ui.notice(error.message);controls.disabled=false;}
  }
  const showResult=format.render(controls,session.exercise,submit);
}
