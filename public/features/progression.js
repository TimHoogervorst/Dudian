import {testActions} from '../test-actions.js';
import {displayLevel} from '../reading-progress.js';
import {icon} from '../icons.js';
import {api,el,link} from '../ui.js';

function phaseStatus(score,progress){
  if(score<=progress.passed)return 'Passed';
  if(score===progress.milestone)return 'Milestone reached';
  if(score===progress.passed+1)return 'Next phase';
  return 'Locked';
}

function hskScale(progress,filterButton){
  const {level}=progress;
  const scale=el('div',null,'roadmap-scale');
  scale.setAttribute('role','group');
  scale.setAttribute('aria-label','Select an HSK level to view its test and reading formats. Current score '+displayLevel(level));
  scale.style.setProperty('--position',level/6*100+'%');
  const rail=el('div',null,'roadmap-rail');
  for(let i=0;i<=6;i++){
    const tick=filterButton(i,i?'HSK '+i:'0');
    tick.className='roadmap-tick';
    tick.style.left=i/6*100+'%';
    if(level>=i)tick.classList.add('reached');
    if(i>0){
      const status=phaseStatus(i,progress);
      tick.setAttribute('aria-label','HSK '+i+' · '+status);
      if(status==='Locked'){
        tick.classList.add('locked');
        tick.append(icon('lock'));
      }
    }
    rail.append(tick);
  }
  rail.append(el('strong',displayLevel(level),'roadmap-marker'));
  scale.append(rail);
  return scale;
}

function nextUnlock(cards){
  const upcoming=el('section');
  const next=cards.find(card=>!card.unlocked);
  const names=next?cards.filter(card=>card.threshold===next.threshold).map(card=>card.label):[];
  upcoming.append(el('h2',next?'Next unlock · HSK '+next.threshold:'All formats unlocked'),
    el('p',next?new Intl.ListFormat('en').format(names):cards.length+' of '+cards.length+' reading formats'));
  return upcoming;
}

export function setup(ui){
  ui.route('progression',async({root,signal,parts})=>{
    const progress=await api('/api/progression',undefined,signal);
    const {level,groups}=progress;
    if(signal.aborted)return;
    const cards=groups.flatMap(({type,cards})=>cards.map(card=>({...card,type})))
      .sort((a,b)=>a.threshold-b.threshold);
    const heading=el('header',null,'progression-heading');
    heading.append(el('h1','Progression'),el('p',cards.filter(card=>card.unlocked).length+' of '+cards.length+' formats unlocked'));
    const filters=new Map();
    const summary=el('div',null,'roadmap-summary');
    const test=el('section',null,'roadmap-test');
    summary.append(test,nextUnlock(cards));
    const defaultLevel=progress.milestone??Math.min(6,progress.passed+1);
    function showTest(score){
      const status=phaseStatus(score,progress);
      const passed=status==='Passed';
      test.replaceChildren(el('h2','HSK '+score+' test'));
      if(status==='Locked'){
        test.append(el('p','Locked · Pass the HSK '+(score-1)+' test to unlock this phase.'));
        return;
      }
      if(status==='Next phase'){
        test.append(el('p','Next phase · Reach HSK '+score+' to take this test.'));
        return;
      }
      test.append(el('p',passed?'Passed · Practice retakes are available.':'Milestone reached · Pass this test to continue.'),
        testActions(score,passed));
      for(const result of progress.summaries.filter(s=>s.level===score)){
        test.append(link('Review '+result.status+' test','#/milestone/'+result.id,'test-result-link'));
      }
    }
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
      if(Number.isInteger(score)&&score>0)showTest(score);
      else if(score===0)test.replaceChildren(el('h2','Milestone tests'),el('p','Reach HSK 1 to unlock your first test.'));
      else showTest(defaultLevel);
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
    root.append(heading,hskScale(progress,filterButton),summary,section);
    const requested=Number(parts[0]);
    select(Number.isInteger(requested)&&requested>=1&&requested<=6?requested:defaultLevel);
  });
}
