import {el,api,link,ui} from '../ui.js';
import {drawPractice} from '../practice-exercises.js';
import {summaryHeading} from '../summary-heading.js';

async function startReview(options) {
  const session = await api('/api/practice/sets',options);
  ui.navigate('/exercises/'+session.id);
}
export function startWordReview(words) {
  return startReview({kind:'word',words});
}
function libraryAction({root,parts}) {
  if(parts[1]==='entry')return;
  const button = el('button','Practice','button lib-review');
  button.onclick = async () => {
    button.disabled=true;
    try { await startReview({kind:'mixed',level:Number(parts[1]??1)}); }
    catch(error){ui.notice(error.message);}
    finally {button.disabled=false;}
  };
  root.querySelector('.lib-controls')?.append(button);
}

function drawSummary(root,session){
  const page=el('div',null,'page-summary');
  const groups=new Map([['Improved',[]],['Went down',[]],['Held steady',[]],['Earlier reviews',[]]]);
  const grades={correct:'Got it',almost:'Almost',incorrect:'Incorrect'};
  for(const item of session.results){
    const group=item.points===null?'Earlier reviews':item.points>0?'Improved':item.points<0?'Went down':'Held steady';
    groups.get(group).push(item);
  }
  const metrics=session.exercise===null?[[session.total,'Exercises'],[session.results.length,'Items reviewed'],[session.results.filter(i=>i.grade==='correct').length,'Correct']]:[[session.total,'Cards reviewed'],[session.results.filter(item=>item.grade==='correct').length,'Got it'],
    [session.results.filter(item=>item.grade==='almost').length,'Almost'],[session.results.filter(item=>item.grade==='incorrect').length,'Incorrect']];
  const titles={mixed:'Words and characters',word:'Word practice',character:'Character practice'};
  page.append(summaryHeading('Practice complete',titles[session.kind],metrics));
  for(const [name,items] of groups){
    if(!items.length)continue;
    const section=el('section',null,'summary-panel');
    const heading=el('div',null,'summary-section-heading');
    heading.append(el('h2',name),el('span',items.length+(items.length===1?' item':' items')));
    const cards=el('div',null,'summary-characters');
    for(const item of items){
      const card=link('','#/library/'+item.kind+'/entry/'+encodeURIComponent(item.text),'summary-character');
      const glyph=el('strong',item.text);glyph.lang='zh-Hans';
      card.append(glyph,el('span',item.pinyin??''));
      if(item.points!==null){
        const delta=(item.points>0?'+':'')+item.points;
        card.append(el('b',delta+(Math.abs(item.points)===1?' point':' points'),item.points<0?'recall-loss':item.points===0?'recall-steady':''));
      }
      card.append(el('small',grades[item.grade]));cards.append(card);
    }
    section.append(heading);
    if(name==='Earlier reviews')section.append(el('p','These grades were saved before point changes were recorded.'));
    section.append(cards);page.append(section);
  }
  const actions=el('div',null,'summary-actions');
  if(session.remainingDue){
    const more=el('button','Practice more · '+session.remainingDue+' still due','button');
    more.onclick=async()=>{
      more.disabled=true;
      try{const next=await api('/api/practice/sets/'+session.id+'/extend',{});ui.navigate('/exercises/'+next.id);}
      catch(error){ui.notice(error.message);more.disabled=false;}
    };
    actions.append(more);
  }
  actions.append(link('Back to Library',session.kind==='mixed'?'#/library':'#/library/'+session.kind,'button'));
  page.append(actions);root.append(page);
}

function draw(root,session) {
  root.replaceChildren();
  if (!session.card) {
    drawSummary(root,session);
    return;
  }
  const header = el('header',null,'card-heading');
  header.append(link('← Library',session.kind==='mixed'?'#/library':'#/library/'+session.kind,'text-link'),el('h1','Flashcards'));
  root.append(header);
  const card = el('section',null,'recall-card');
  const counter = el('p',(session.card.kind==='character'?'Characters':'Words')+' · '+(session.index+1)+' of '+session.total,'overline');
  const text = el('h2',session.card.text,'recall-text');
  text.lang='zh-Hans';
  const readings=el('p',[...new Set(session.card.senses.map(s=>s.pinyin))].join(' · '),'recall-pinyin');
  const hint=el('button','Show example','recall-example-button');
  const glyph=el('span','文');glyph.setAttribute('aria-hidden','true');hint.prepend(glyph);
  const example=el('p',null,'recall-example');example.lang='zh-Hans';example.id='card-example';example.hidden=true;
  hint.setAttribute('aria-expanded','false');hint.setAttribute('aria-controls',example.id);
  hint.onclick=async()=>{
    hint.disabled=true;
    try{
      if(!example.hasChildNodes()){
        hint.lastChild.textContent='Loading example…';
        const {before,target,after}=await api('/api/flashcards/sessions/'+session.id+'/example',{index:session.index});
        example.append(before,el('mark',target),after);
      }
      example.hidden=!example.hidden;
      hint.setAttribute('aria-expanded',String(!example.hidden));
    }catch(error){if(card.isConnected)ui.notice(error.message);}
    finally{hint.lastChild.textContent=example.hidden?'Show example':'Hide example';hint.disabled=false;}
  };
  const reveal = el('button','Reveal answer','button');
  card.append(counter,text,readings,hint,example,reveal);
  root.append(card);
  let busy=false;
  const grade = async value => {
    if (busy) return;
    busy=true;
    try {
      const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      const next = await api('/api/flashcards/sessions/'+session.id+'/grade',{index:session.index,grade:value,zone});
      draw(root,next);
      if(next.card)root.querySelector('button')?.focus();
      else{
        const title=root.querySelector('h1');title.tabIndex=-1;title.focus();
      }
    } finally {busy=false;}
  };
  reveal.onclick=()=>{
    reveal.remove();
    const answers = el('div',null,'recall-answers');
    const groups = new Map();
    for (const s of session.card.senses) {
      if (!groups.has(s.pinyin)) groups.set(s.pinyin,[]);
      groups.get(s.pinyin).push(s.meaning);
    }
    for (const [reading, meanings] of groups) {
      const row=el('p');
      row.append(el('strong',reading),document.createTextNode(' · '+meanings.join(' / ')));
      answers.append(row);
    }
    const controls = el('div',null,'recall-grades');
    for (const [value,label] of [['incorrect','Incorrect'],['almost','Almost'],['correct','Got it']]) {
      const button = el('button',label);
      button.onclick=()=>grade(value);
      controls.append(button);
    }
    card.append(answers,controls,el('p','Swipe left for Incorrect, down for Almost, or right for Got it.','recall-hint'));
    controls.querySelector('button').focus();
    let origin;
    card.onpointerdown = event => {
      if (event.pointerType==='mouse' || event.target.closest('button')) return;
      origin={x:event.clientX,y:event.clientY};
      card.setPointerCapture(event.pointerId);
    };
    card.onpointercancel=()=>{origin=null;};
    card.onpointerup=event=>{
      if (!origin) return;
      const dx=event.clientX-origin.x, dy=event.clientY-origin.y;
      origin=null;
      if (dy>50 && dy>Math.abs(dx)) return grade('almost');
      if (Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)) return grade(dx>0?'correct':'incorrect');
    };
  };
}
export function setup(ui) {
  ui.on('library',libraryAction);
  ui.route('exercises',async ({root,parts})=>{
    const session=await api('/api/practice/sets/'+encodeURIComponent(parts[0]));
    drawPractice(root,session,drawSummary);
  });
  ui.route('cards',async ({root,parts})=>{
    const session = await api('/api/flashcards/sessions/'+encodeURIComponent(parts[0]));
    draw(root,session);
  });
}
