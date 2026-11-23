import {el,api,link,ui} from '../ui.js';

async function startReview(options) {
  const session = await api('/api/flashcards/sessions',options);
  ui.navigate('/cards/'+session.id);
}
export function startWordReview(words) {
  return startReview({kind:'word',words});
}
function libraryAction({root,parts}) {
  if (parts[1]==='entry') return;
  const kind = parts[0]==='word'?'word':'character';
  const button = el('button',kind==='word'?'Practice words':'Practice characters','button lib-review');
  button.onclick = async () => {
    button.disabled=true;
    try { await startReview({kind,level:Number(parts[1]??1)}); }
    finally {button.disabled=false;}
  };
  root.querySelector('.lib-controls')?.append(button);
}

function draw(root,session) {
  root.replaceChildren();
  const header = el('header',null,'card-heading');
  const deck = session.kind==='word'?'Words':'Characters';
  header.append(link('← '+deck,'#/library/'+session.kind,'text-link'),el('h1','Flashcards'));
  root.append(header);
  if (!session.card) {
    const result = el('section',null,'recall-card');
    result.append(el('h2','Review complete'),el('p',session.total+' '+(session.total===1?'card':'cards')+' reviewed.'),
      link('Back to Library','#/library/'+session.kind,'button'));
    root.append(result);
    return;
  }
  const card = el('section',null,'recall-card');
  const counter = el('p',deck+' · '+(session.index+1)+' of '+session.total,'overline');
  const text = el('h2',session.card.text,'recall-text');
  const reveal = el('button','Reveal answer','button');
  card.append(counter,text,reveal);
  root.append(card);
  let busy=false;
  const grade = async value => {
    if (busy) return;
    busy=true;
    try {
      const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      const next = await api('/api/flashcards/sessions/'+session.id+'/grade',{index:session.index,grade:value,zone});
      draw(root,next);
      root.querySelector('button,a.button')?.focus();
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
  ui.route('cards',async ({root,parts})=>{
    const session = await api('/api/flashcards/sessions/'+encodeURIComponent(parts[0]));
    draw(root,session);
  });
}
