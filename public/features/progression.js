import {displayLevel,readingProgress} from '../reading-progress.js';
import {icon} from '../icons.js';
import {api,el} from '../ui.js';

function hskScale(level,filterButton){
  const scale=el('div',null,'roadmap-scale');
  scale.setAttribute('role','group');
  scale.setAttribute('aria-label','Filter formats by HSK level. Current score '+displayLevel(level));
  scale.style.setProperty('--position',level/6*100+'%');
  const rail=el('div',null,'roadmap-rail');
  for(let i=0;i<=6;i++){
    const tick=filterButton(i,i?'HSK '+i:'0');
    tick.className='roadmap-tick';
    tick.style.left=i/6*100+'%';
    if(level>=i)tick.classList.add('reached');
    rail.append(tick);
  }
  rail.append(el('strong',displayLevel(level),'roadmap-marker'));
  scale.append(rail);
  return scale;
}

function intervalSummary(level,cards){
  const band=Math.min(5,Math.floor(level));
  const percent=Math.floor((level-band)*100+1e-9);
  const summary=el('div',null,'roadmap-summary');
  const interval=el('section');
  const heading=el('div',null,'hsk-progress-heading');
  heading.append(el('h2','Current interval · '+(band?'HSK '+band:'0')+' → HSK '+(band+1)),el('strong',percent+'%'));
  const track=el('div',null,'hsk-progress-track');
  track.style.setProperty('--progress',percent+'%');
  interval.append(heading,track);
  const upcoming=el('section');
  const next=cards.find(card=>!card.unlocked);
  const names=next?cards.filter(card=>card.threshold===next.threshold).map(card=>card.label):[];
  upcoming.append(el('h2',next?'Next unlock · HSK '+next.threshold:'All formats unlocked'),
    el('p',next?new Intl.ListFormat('en').format(names):cards.length+' of '+cards.length+' reading formats'));
  summary.append(interval,upcoming);
  return summary;
}

export function setup(ui){
  ui.route('progression',async({root,signal})=>{
    const progress=await api('/api/progression',undefined,signal);
    const {level,groups}=progress;
    if(signal.aborted)return;
    const cards=groups.flatMap(({type,cards})=>cards.map(card=>({...card,type})))
      .sort((a,b)=>a.threshold-b.threshold);
    const heading=el('header',null,'progression-heading');
    heading.append(el('h1','Progression'),el('p',cards.filter(card=>card.unlocked).length+' of '+cards.length+' formats unlocked'));
    const filters=new Map();
    const section=el('section',null,'milestone-group');
    const list=el('ol');
    const title=el('h2');
    title.setAttribute('aria-live','polite');
    const empty=el('p','No reading formats unlock at this level.');
    const extra=el('div',null,'roadmap-filters');
    extra.append(filterButton(null,'All formats'));
    for(const score of new Set(cards.map(card=>card.threshold).filter(n=>!Number.isInteger(n)))){
      extra.append(filterButton(score,'HSK '+score));
    }
    section.append(title,extra,list,empty);
    function filterButton(score,label){
      const button=el('button',label);
      button.type='button';
      button.onclick=()=>select(score);
      filters.set(score,button);
      return button;
    }
    function select(score){
      for(const [value,button] of filters)button.setAttribute('aria-pressed',String(value===score));
      title.textContent=score===null?'All reading formats':'Reading formats · HSK '+score;
      const matches=cards.filter(card=>score===null||card.threshold===score);
      list.replaceChildren(...matches.map(formatCard));
      empty.hidden=matches.length>0;
    }
    const symbols={book:'book',article:'newspaper',dialogue:'conversation'};
    function formatCard(card){
      const item=el('li',null,card.unlocked?'unlocked':'locked');
      const top=el('div',null,'format-threshold');
      top.append(icon(symbols[card.type]),el('span','HSK '+card.threshold));
      item.append(top,el('strong',card.label),el('small',card.unlocked?
        '✓ Unlocked'+(card.current?' · Current stage':''):'Locked · Reach HSK '+card.threshold));
      return item;
    }
    const summary=intervalSummary(level,cards);
    if(progress.milestone||progress.passed)summary.firstElementChild.replaceWith(readingProgress(level,undefined,progress));
    root.append(heading,hskScale(level,filterButton),summary,section);
    select(progress.milestone??Math.min(6,Math.floor(level)+1));
  });
}
