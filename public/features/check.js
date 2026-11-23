import {markCompleted,reviewHref} from '../reader-layout.js';

export function setup(ui){
  ui.route('check',({parts})=>ui.navigate('read/'+encodeURIComponent(parts[0])+'/'+Number(parts[1])));
}

export async function mountCheck(ui,context){
  const {el,api,link}=ui;
  const {story,position,signal,onLeave,aside,definition,controls}=context;
  const id=encodeURIComponent(story.id),chapter=position.chapter;
  const root=el('section',null,'inline-check');
  controls.after(root);
  const endpoint='/api/stories/'+id+'/check/'+chapter;
  let [state,{pinyin}]=await Promise.all([api(endpoint,undefined,signal),api('/api/reader-preferences',undefined,signal)]);
  const visibleTranslations=new Set();
  let pending;
  onLeave(()=>pending);
  function chinese(item,interactive){
    const span=el('span',null,'check-chinese');
    span.lang='zh-Hans';
    for(const token of item.tokens){
      const word=el('span',token.text);
      if(pinyin && token.pinyin){
        const ruby=el('ruby',token.text);
        ruby.append(el('rt',token.pinyin));
        word.replaceChildren(ruby);
      }
      if(token.meaning){
        const preview=()=>{
          const close=el('button','×','dictionary-close');
          close.setAttribute('aria-label','Close dictionary');
          close.onclick=()=>aside.classList.remove('has-word');
          definition.replaceChildren(el('strong',token.text,'dictionary-word'),el('p',token.pinyin,'dictionary-reading'),
            el('p',token.meaning,'dictionary-meaning'),close);
          aside.classList.add('has-word');
        };
        word.className='quiz-word';
        word.onpointerenter=e=>{if(e.pointerType==='mouse')preview();};
        if(interactive){
          word.tabIndex=0;
          word.setAttribute('role','button');
          word.setAttribute('aria-label','Look up '+token.text);
          word.onfocus=word.onclick=preview;
          word.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();preview();}};
        }
      }
      span.append(word);
    }
    return span;
  }
  function render(focusIndex,action){
    markCompleted(context.root,state.completion.chapters);
    root.replaceChildren();
    async function act(input){
      if(pending)return;
      const buttons=root.querySelectorAll('button:enabled');
      buttons.forEach(b=>b.disabled=true);
      try{
        pending=(async()=>{
          if(input.action==='answer'){
            await context.flushWordActions?.();
            await context.flushActiveTime?.();
          }
          return api(endpoint,input);
        })();
        state=await pending;
        if(!signal.aborted){
          if(input.action==='english')visibleTranslations.add(input.question);
          render(input.question,input.action);
        }
      }catch(error){
        buttons.forEach(b=>b.disabled=false);
        if(!signal.aborted)ui.notice(error.message);
      }finally{pending=undefined;}
    }
    const comprehension=state.questions.filter(q=>!q.reviewRound);
    const firstReview=state.questions.findIndex(q=>q.reviewRound);
    state.questions.forEach((q,i)=>{
      if(q.reviewRound)return;
      const card=el('section',null,'check-card');
      const prompt=el('h2');
      prompt.append(chinese(q.prompt,true));
      card.append(el('p','Question '+(i+1)+' of '+comprehension.length,'overline'),prompt);
      const translation=el('details',null,'paragraph-translation check-translation');
      translation.lang='en';
      translation.open=visibleTranslations.has(i);
      const reveal=el('summary',translation.open?'Hide translation':'Show translation');
      translation.append(reveal);
      if(q.english)translation.append(el('div',q.prompt.en));
      reveal.onclick=e=>{
        if(pending){e.preventDefault();return;}
        if(!q.english){e.preventDefault();void act({action:'english',question:i});}
      };
      translation.ontoggle=()=>{
        if(!translation.isConnected)return;
        if(translation.open)visibleTranslations.add(i);
        else visibleTranslations.delete(i);
        reveal.textContent=translation.open?'Hide translation':'Show translation';
        for(const en of choices.querySelectorAll('small'))en.hidden=!translation.open;
      };
      card.append(translation);
      const choices=el('div',null,'check-choices');
      q.choices.forEach((c,j)=>{
        const button=el('button');
        button.append(chinese(c,false));
        if(q.english){
          const en=el('small',c.en);en.lang='en';en.hidden=!translation.open;button.append(en);
        }
        button.disabled=q.choice!==null;
        if(q.correct===j)button.classList.add('check-correct');
        else if(q.choice===j)button.classList.add('check-wrong');
        button.onclick=()=>act({action:'answer',question:i,choice:j});
        choices.append(button);
      });
      card.append(choices);
      if(q.choice!==null){
        const feedback=el('p',q.correct===q.choice?'Correct. ':'Your answer: '+q.choices[q.choice].zh+' · Correct answer: '+q.choices[q.correct].zh+'. ','check-feedback');
        const evidence=el('span',q.evidence);evidence.lang='zh-Hans';feedback.append(evidence);
        feedback.setAttribute('role','status');
        card.append(feedback);
      }
      root.append(card);
      if(focusIndex===i){
        const focus=action==='english'?reveal:card.querySelector('.check-feedback')??prompt;
        if(focus!==reveal)focus.tabIndex=-1;
        focus.focus({preventScroll:true});
      }
    });
    if(firstReview>=0 && comprehension.every(q=>q.choice!==null)){
      markCompleted(context.root,[chapter]);
      const review=state.questions.find(q=>q.reviewRound && q.choice===null);
      if(review)root.append(link('Continue to word review '+review.reviewRound+' →',reviewHref(story.id,chapter,review.reviewRound),'button'));
    }
    if(state.completion.chapters.includes(chapter)){
      const correct=comprehension.filter(q=>q.correct===q.choice).length;
      root.append(el('p','Chapter finished · '+correct+' of '+comprehension.length+' comprehension questions correct'),
        state.completion.finished?link('Story summary →','#/summary/'+id,'button'):
          link('Continue to chapter '+(state.next+1)+' →','#/read/'+id+'/'+state.next,'button'));
    }
  }
  if(!signal.aborted)render();
}
