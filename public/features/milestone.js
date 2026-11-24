import {api,el,link} from '../ui.js';
import {matching} from '../practice-exercises.js';

function chinese(line,pinyin){
  const group=el('span',null,'test-chinese');
  group.lang='zh-Hans';
  group.append(el('span',line.text));
  if(pinyin)group.append(el('small',line.pinyin));
  return group;
}

export function setup(ui){
  ui.route('milestone',async({root,parts,signal})=>{
    const endpoint='/api/milestone-tests/'+encodeURIComponent(parts[0]);
    let [state,preferences]=await Promise.all([api(endpoint,undefined,signal),api('/api/reader-preferences',undefined,signal)]);
    let pinyin=preferences.pinyin;
    function draw(){
      if(signal.aborted)return;
      const header=el('header',null,'test-heading');
      const title=el('h1','HSK '+state.level+' milestone test');
      header.append(link('← Progression','#/progression','text-link'),title);
      const card=el('section',null,'test-paper');
      root.replaceChildren(header,card);
      function action(label,fn){
        const b=el('button',label,'button');
        b.onclick=async()=>{
          b.disabled=true;
          try{await fn();}catch(e){ui.notice(e.message);}finally{b.disabled=false;}
        };
        return b;
      }
      if(state.status==='ready'){
        const list=el('ol',null,'test-outline');
        for(const s of state.outline)list.append(el('li',s.kind==='Practice'?s.title:s.kind+' · '+s.title));
        card.append(el('h2','Introduction'),el('p','15 sections · 18 comprehension questions · 10 vocabulary exercises'),
          el('p','You can make three mistakes. Each incorrect matching pair counts separately. You can leave and continue later.'),
          list,action('Start test',async()=>{state=await api(endpoint+'/start',{});draw();}));
        return;
      }
      if(state.status!=='active'){
        card.append(el('h2',state.status==='passed'?'HSK '+state.level+' passed':'Test ended'),
          el('p',state.mistakes+' mistakes'));
        if(state.status==='failed')card.append(action('Generate new test',async()=>{
          const next=await api('/api/milestone-tests',{level:state.level});
          if(!signal.aborted)ui.navigate('/milestone/'+next.id);
        }));
        card.append(link('View progression','#/progression','text-link'),el('h3','Answer review'));
        for(const r of state.review){
          const entry=el('div',null,'test-review');
          entry.append(el('strong','Section '+(r.section+1)+' · '+r.text),
            el('p',(r.correct?'Correct · ':'Incorrect · ')+r.chosen));
          if(!r.correct)entry.append(el('p','Correct answer · '+r.meaning));
          entry.append(el('p',r.explanation));card.append(entry);
        }
        return;
      }
      const section=state.outline[state.section];
      const counter=el('p','Section '+(state.section+1)+' of 15 · '+section.kind+' · '+state.mistakes+' of 3 mistakes','overline');
      counter.setAttribute('role','status');
      card.append(counter,el('h2',section.title));
      const options=el('div',null,'test-tools');
      const toggle=el('button',pinyin?'Hide pinyin':'Show pinyin');
      toggle.setAttribute('aria-pressed',String(pinyin));
      toggle.onclick=()=>{pinyin=!pinyin;card.classList.toggle('hide-pinyin',!pinyin);
        toggle.textContent=pinyin?'Hide pinyin':'Show pinyin';toggle.setAttribute('aria-pressed',String(pinyin));};
      options.append(toggle);
      card.classList.toggle('hide-pinyin',!pinyin);
      const reading=[...state.lines.map(l=>l.text),...(state.question?[state.question.prompt.text,...state.question.choices.map(c=>c.text)]:state.exercise.targets.map(t=>t.text))];
      if(window.speechSynthesis){
        const listen=el('button','Listen in Mandarin');
        listen.onclick=()=>{
          const utterance=new SpeechSynthesisUtterance(reading.join('。'));
          utterance.lang='zh-CN';window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);
        };
        options.append(listen);
      }
      card.append(options);
      for(const line of state.lines){
        const paragraph=el('p');paragraph.append(chinese(line,true));card.append(paragraph);
      }
      const form=el('fieldset',null,'practice-controls');
      const legend=el('legend','Task '+(state.task+1)+' of '+section.count);
      form.append(legend);card.append(form);
      async function submit(answers){
        if(form.disabled)return;
        form.disabled=true;
        try{state=await api(endpoint+'/submit',{index:state.index,answers});draw();}
        catch(e){ui.notice(e.message);form.disabled=false;}
      }
      if(state.exercise?.type==='match'){matching(form,state.exercise,submit);return;}
      const prompt=state.question?.prompt??state.exercise.targets[0];
      form.append(chinese(prompt,true));
      const choices=state.question?.choices??state.exercise.options;
      const grid=el('div',null,'practice-options');
      let selected;
      const check=el('button','Submit answer','button');
      check.disabled=true;check.onclick=()=>submit([selected]);
      choices.forEach((c,i)=>{
        const b=el('button',typeof c==='string'?c:null);
        if(typeof c!=='string')b.append(chinese(c,true));
        b.setAttribute('aria-pressed','false');
        b.onclick=()=>{selected=i;for(const option of grid.children)option.setAttribute('aria-pressed',String(option===b));check.disabled=false;};
        grid.append(b);
      });
      form.append(grid,check);
    }
    signal.addEventListener('abort',()=>window.speechSynthesis?.cancel(),{once:true});
    draw();
  });
}
