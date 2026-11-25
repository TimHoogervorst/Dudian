import {api,el,link} from '../ui.js';
import {choicePrompt,matching} from '../practice-exercises.js';
import {questionCard} from '../question-card.js';
import {stopReading} from '../reader-audio.js';
import {summaryHeading} from '../summary-heading.js';
import {addCheckmark,readerFrame,chapterHeading,readingWord} from '../reader-layout.js';

function chinese(line,pinyin){
  const span=el('span',null,'check-chinese');
  span.lang='zh-Hans';
  for(const word of line.tokens??[line])span.append(readingWord(word,pinyin));
  return span;
}
export function setup(ui){
  ui.route('milestone',async({root,parts,signal,onLeave})=>{
    const endpoint='/api/milestone-tests/'+encodeURIComponent(parts[0]);
    const [initial,{pinyin}]=await Promise.all([api(endpoint,undefined,signal),api('/api/reader-preferences',undefined,signal)]);
    let state=initial;
    if(state.status==='ready'&&!signal.aborted)state=await api(endpoint+'/start',{});
    let pending;
    onLeave(()=>pending);
    function run(work){
      if(pending||signal.aborted)return;
      root.inert=true;
      pending=work().catch(error=>{if(!signal.aborted){ui.notice(error.message);draw();}})
        .finally(()=>{pending=undefined;root.inert=false;});
    }
    function button(label,fn){
      const b=el('button',label,'button');b.onclick=()=>run(fn);return b;
    }
    function draft(section,task){
      const count=state.sections[section].tasks[task].targets.length||1;
      return state.answers.find(a=>a.section===section&&a.task===task)?.answers??Array(count).fill(-1);
    }
    function blanks(section){
      return state.sections[section].tasks.reduce((n,q,i)=>n+draft(section,i).filter(a=>a<0).length,0);
    }
    async function move(section){
      await api(endpoint+'/draft',{section},undefined,true);
      state.position=section;draw();
      root.inert=false;
      root.querySelector('h1')?.focus();
    }
    function draw(){
      if(signal.aborted)return;
      stopReading();
      root.replaceChildren();
      if(state.status!=='active'){
        const panel=el('section',null,'summary-panel test-result');
        const passed=state.status==='passed';
        panel.append(summaryHeading('HSK '+state.level+' milestone test',passed?'Passed':'Failed',
          [[state.mistakes,'Incorrect'],[state.unanswered,'Unanswered']],null,passed));
        for(const r of state.review){
          const entry=el('section',null,'test-review');
          entry.append(el('small',state.sections[r.section].title+' · Question '+(r.task+1)),el('h2',r.text),
            el('p','Your answer: '+(r.chosen??'Unanswered')),el('p','Correct answer: '+r.meaning));
          panel.append(entry);
        }
        panel.append(button('Done',async()=>{await api(endpoint+'/discard',{});if(!signal.aborted)ui.navigate('/progression');}));
        root.append(panel);return;
      }
      const frame=readerFrame(root,{title:'HSK '+state.level+' milestone test',
        back:link('← Progression','#/progression','text-link'),dictionary:false});
      const {list,center}=frame;
      const index=state.position;
      const entries=['Introduction',...state.sections.map(s=>s.title),'Submit test'];
      const sectionLinks=[];
      entries.forEach((title,entry)=>{
        const i=entry-1; // Introduction precedes the zero-based scored sections.
        const row=el('li'),a=link(title,'#/milestone/'+state.id);
        a.onclick=e=>{e.preventDefault();run(()=>move(i));};
        if(i===index)a.setAttribute('aria-current','page');
        if(i>=0&&i<state.sections.length){
          sectionLinks[i]=a;
          a.prepend(el('span',String(i+1),'chapter-number'));
          if(!blanks(i))addCheckmark(a);
        }
        row.append(a);list.append(row);
      });
      if(index===-1){
        const outcome=state.practiceRetake?'This is a practice retake. You have already passed this milestone.':
          state.level===6?'Passing completes your final HSK milestone.':'Passing unlocks progress toward HSK '+(state.level+1)+'.';
        center.append(chapterHeading('HSK '+state.level+' milestone test','Introduction'),
          el('p','Read the passages and answer the vocabulary questions. You can visit the sections in any order and change your answers before handing in the test.'),
          el('h2','How to pass'),
          el('p','Answer every question and make at most three mistakes. Each incorrect matching pair counts as one mistake. A blank answer or a fourth mistake means the test is failed.'),
          el('h2','When you’re ready'),
          el('p','Choose Submit test at the end of the section list. Your summary will show whether you passed and which answers you missed.'),
          el('p',outcome+' If you fail, you can take a fresh test as many times as you need.'),
          button('Go to section 1',()=>move(0)));
        return;
      }
      if(index===state.sections.length){
        center.append(chapterHeading('Final submission','Submit test'));
        const missing=state.sections.reduce((n,s,i)=>n+blanks(i),0);
        if(missing){
          const first=state.sections.findIndex((s,i)=>blanks(i)>0);
          center.append(el('p',missing+' unanswered. Submitting with any blank answer will fail this test.','test-warning'),
            button('Go to first blank',async()=>{
              await move(first);
              const task=state.sections[first].tasks.findIndex((q,i)=>draft(first,i).includes(-1));
              root.querySelectorAll('.test-question')[task]?.focus();
            }));
        }else center.append(el('p','All answers are filled in. You can still review them before submitting.'));
        center.append(button(missing?'Submit anyway':'Submit test',async()=>{
          state=await api(endpoint+'/submit',{confirm:true});draw();
        }));
        return;
      }
      const section=state.sections[index];
      frame.chapter({...section,paragraphs:section.lines.map(line=>line.tokens)},{
        label:'Section '+(index+1)+' of '+state.sections.length+' · '+section.kind,pinyin,signal,translation:false
      });
      section.tasks.forEach((q,i)=>{
        const title=q.prompt?chinese(q.prompt,pinyin):q.targets.length>1?'Match the meanings':'Choose the English meaning';
        const options=q.options.map(o=>typeof o==='string'?{text:o,lang:'en-US'}:o);
        const {card}=questionCard({number:i+1,total:section.tasks.length,title,signal,
          audio:[...(q.prompt?[q.prompt]:q.targets),...options],
          className:q.prompt?'test-question check-card':'test-question test-exercise'});
        if(q.type==='choice')card.classList.add('test-word-choice','practice-controls');
        card.tabIndex=-1;
        if(!pinyin)card.classList.add('hide-pinyin');
        const answers=draft(index,i);
        const save=values=>run(async()=>{
          await api(endpoint+'/draft',{section:index,task:i,answers:values},undefined,true);
          state.answers=state.answers.filter(a=>a.section!==index||a.task!==i);
          state.answers.push({section:index,task:i,answers:values});
          if(!blanks(index))addCheckmark(sectionLinks[index]);
          if(q.targets.length<=1)Array.from(choices.children).forEach((b,j)=>b.setAttribute('aria-pressed',String(j===values[0])));
        });
        const choices=el('div',null,q.prompt?'check-choices':'check-choices practice-options');
        if(q.targets.length>1)matching(card,q,null,{answers,change:save});
        else{
          if(q.type==='choice')choicePrompt(card,q);
          q.options.forEach((o,j)=>{
            const b=el('button');
            if(typeof o==='string')b.textContent=o;else b.append(chinese(o,pinyin));
            b.setAttribute('aria-pressed',String(answers[0]===j));b.onclick=()=>save([j]);choices.append(b);
          });card.append(choices);
        }
        center.append(card);
      });
      center.append(button(index+1===state.sections.length?'Review and submit':'Next section',()=>move(index+1)));
    }
    draw();
  });
}
