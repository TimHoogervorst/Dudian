import {api,el,link,ui} from './ui.js';
import {readerLayout,reviewHref,addCheckmark,markCompleted} from './reader-layout.js';

export async function reviewPage({root,story,position,round,signal,onLeave}){
  const chapter=position.chapter,id=encodeURIComponent(story.id);
  const {center}=readerLayout(root,story,chapter,round);
  const heading=el('header',null,'chapter-heading');
  heading.append(el('p','After chapter '+(chapter+1),'overline'),el('h1','Word review '+round));
  const panel=el('section');
  center.append(heading,panel);
  const endpoint='/api/stories/'+id+'/check/'+chapter;
  let [state,{pinyin}]=await Promise.all([api(endpoint,undefined,signal),api('/api/reader-preferences',undefined,signal)]);
  let pending;
  if(signal.aborted)return;
  onLeave(()=>pending);
  const readHref=i=>'#/read/'+id+'/'+i;
  markCompleted(root,state.completion.chapters);
  const cards=state.questions.filter(q=>q.reviewRound===round);
  const prior=state.questions.find(q=>(!q.reviewRound||q.reviewRound<round)&&q.choice===null);
  if(prior){
    panel.append(el('p','Finish '+(prior.reviewRound?'word review '+prior.reviewRound:'the chapter questions')+' to start this review.'),
      prior.reviewRound?link('Go to word review '+prior.reviewRound,reviewHref(story.id,chapter,prior.reviewRound),'button'):
        link('Go to chapter '+(chapter+1),readHref(chapter),'button'));
    return;
  }
  panel.append(el('p','Choose the English meaning for each word.'));
  cards.forEach((q,number)=>{
    const card=el('section',null,'check-card word-review-card');
    panel.append(card);
    const index=state.questions.indexOf(q);
    const word=el('h2',q.prompt.zh,'check-chinese');word.lang='zh-Hans';
    if(pinyin && q.prompt.pinyin){
      const ruby=el('ruby',q.prompt.zh);ruby.append(el('rt',q.prompt.pinyin));word.replaceChildren(ruby);
    }
    card.append(el('p','Card '+(number+1)+' of '+cards.length,'overline'),word);
    const choices=el('div',null,'check-choices');
    q.choices.forEach((choice,i)=>{
      const button=el('button',choice.en);
      button.onclick=async()=>{
        if(pending)return;
        const enabled=panel.querySelectorAll('button:enabled');
        enabled.forEach(b=>b.disabled=true);
        try{
          pending=api(endpoint,{action:'answer',question:index,choice:i});
          state=await pending;
          if(!signal.aborted)refresh(index);
        }catch(error){
          if(!signal.aborted){ui.notice(error.message);enabled.forEach(b=>b.disabled=false);}
        }finally{pending=undefined;}
      };
      choices.append(button);
    });
    card.append(choices);
  });
  function refresh(last){
    markCompleted(root,state.completion.chapters);
    const updated=state.questions.filter(q=>q.reviewRound===round);
    const elements=panel.querySelectorAll('.word-review-card');
    updated.forEach((q,number)=>{
      const card=elements[number];
      const buttons=card.querySelectorAll('button');
      buttons.forEach((button,i)=>{
        button.disabled=q.choice!==null;
        if(q.correct===i)button.className='check-correct';
        else if(q.choice===i)button.className='check-wrong';
        if(q.correct===i || q.choice===i){
          const outcome=q.choice===i?(q.correct===i?'Selected, correct':'Selected, incorrect'):'Correct answer';
          button.setAttribute('aria-label',q.choices[i].en+'. '+outcome);
        }
      });
      if(state.questions[last]===q){
        card.tabIndex=-1;
        card.setAttribute('aria-label',q.prompt.zh+'. '+(q.choice===q.correct?'Correct.':'Correct meaning: '+q.choices[q.correct].en));
        card.focus({preventScroll:true});
      }
    });
    if(updated.every(q=>q.choice!==null))finish(updated);
  }
  refresh();
  function finish(cards){
    addCheckmark(root.querySelector('.chapter-list [data-review="'+round+'"]'));
    panel.append(el('p','Review complete · '+cards.filter(q=>q.correct===q.choice).length+' of '+cards.length+' correct.'));
    const following=state.questions.find(q=>q.reviewRound>round && q.choice===null);
    if(following)panel.append(link('Continue to word review '+following.reviewRound+' →',reviewHref(story.id,chapter,following.reviewRound),'button'));
    else if(state.completion.finished)panel.append(link('Story summary →','#/summary/'+id,'button'));
    else {
      const target=chapter+1<story.chapters.length && !state.completion.chapters.includes(chapter+1)?chapter+1:state.next;
      panel.append(link('Continue to chapter '+(target+1)+' →',readHref(target),'button'));
    }
  }
}
