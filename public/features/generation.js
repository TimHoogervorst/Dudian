import {readingProgress} from '../reading-progress.js';
import {icon} from '../icons.js';
import {coverImage,showCover} from './art.js';
import {readerLayout,readingText,markCompleted} from '../reader-layout.js';
import {el,link} from '../ui.js';

const levels = ['easy','medium','hard'];
const title = value => value[0].toUpperCase()+value.slice(1);
function difficultySelect(ui,value) {
  const select=ui.el('select');
  for (const level of levels) {
    const option=ui.el('option',title(level));
    option.value=level;
    select.append(option);
  }
  select.value=value;
  return select;
}
function field(ui,text,control) {
  const label=ui.el('label',text);
  label.append(control);
  return label;
}
export function setup(ui) {
  const {el,api,link}=ui;
  ui.on('settings',async({root})=>{
    const preferences=await api('/api/story-preferences');
    const form=el('form',null,'story-settings');
    form.append(el('h2','Story difficulty'));
    const difficulty=difficultySelect(ui,preferences.difficulty);
    form.append(field(ui,'Default difficulty',difficulty),el('p','Maximum new characters in a story'));
    const inputs={};
    for (const level of levels) {
      const input=el('input');
      input.type='number'; input.min='0'; input.step='1'; input.required=true;
      input.value=String(preferences.ceilings[level]);
      inputs[level]=input;
      form.append(field(ui,title(level),input));
    }
    const button=el('button','Save story settings');
    const result=el('p');result.setAttribute('role','status');
    form.append(button,result);root.append(form);
    form.onsubmit=async e=>{
      e.preventDefault();button.disabled=true;
      try {
        const ceilings=Object.fromEntries(levels.map(key=>[key,inputs[key].valueAsNumber]));
        await api('/api/story-preferences',{difficulty:difficulty.value,ceilings});
        result.textContent='Story settings saved.';
      } catch(error){result.textContent=error.message;}
      finally{button.disabled=false;}
    };
  });
  ui.route('practice',async({root,signal})=>{
    const [preferences,{current}]=await Promise.all([
      api('/api/story-preferences',undefined,signal),
      api('/api/history',undefined,signal),
    ]);
    if(signal.aborted)return;
    const progress=el('div');
    const panel=el('aside',null,'practice-sidebar');
    const layout=el('div',null,'practice-layout');
    const form=el('form',null,'story-options');
    const mode=choiceGroup('Mode','mode','reading',[
      {value:'reading',symbol:'book'}, {value:'speaking',symbol:'microphone',disabled:true},
      {value:'listening',symbol:'headphones',disabled:true},
    ]);
    const storyType=choiceGroup('Type','storyType','book',[
      {value:'book',label:'Book',symbol:'book'},
      {value:'article',label:'Article',symbol:'newspaper'},
      {value:'dialogue',label:'Dialogue',symbol:'conversation'},
    ]);
    const difficulty=choiceGroup('Difficulty','difficulty',preferences.difficulty,levels.map(value=>({value,symbol:value})));
    const duration=choiceGroup('Story length','minutes','10',[
      {value:'10',label:'Short · 1 chapter',symbol:'short'},
      {value:'20',label:'Medium · 2 chapters',symbol:'short'},
      {value:'30',label:'Long · 5 chapters',symbol:'long'},
    ]);
    const button=el('button','Generate story','button');
    button.append(icon('arrow'));
    const status=el('p');status.setAttribute('role','status');
    const subject=el('fieldset');
    const topics=el('div',null,'subject-cards');
    subject.append(el('legend','Subject'),topics);
    const focus=el('fieldset',null,'practice-focus');
    const cards=el('div',null,'focus-cards');
    focus.append(el('legend','Character focus'),cards,el('p','Base estimates assume unaided reading. Your final story score determines the points awarded.','focus-note'));
    form.append(el('h1','Create a story'),mode,storyType,difficulty,duration,subject,focus,button,status);
    layout.append(form);
    if(current){
      const card=el('article',null,'practice-story');
      if(current.id==='tea-shop')card.append(el('div',null,'tea-art practice-art'));
      else if(current.hasCover)card.append(coverImage(current,'practice-art'));
      const copy=el('div',null,'practice-story-copy');
      const label=el('p','In progress');
      label.prepend(icon('bookmark'));
      const resume=link('Continue reading','#/read/'+encodeURIComponent(current.id));
      resume.append(icon('arrow'));
      copy.append(label,el('h2',current.title),resume);
      card.append(copy);panel.append(card);
    }
    panel.append(progress);layout.append(panel);
    root.append(layout);
    let preview,revision=0;
    async function refresh(reroll){
      const request=++revision;
      const choices=new FormData(form);
      button.disabled=true;focus.disabled=true;
      status.textContent='Updating character focus…';
      try{
        const next=await api('/api/practice-preview',{
          type:choices.get('storyType'),minutes:Number(choices.get('minutes')),difficulty:choices.get('difficulty'),previewId:preview?.id,reroll,
        },signal);
        if(signal.aborted||request!==revision)return;
        if(next.subjects.some((item,i)=>preview?.subjects[i]?.zh!==item.zh)){
          topics.replaceChildren(...[{zh:'open',en:'Any subject'},...next.subjects].map((item,i)=>{
            const label=el('label',null,'choice-card subject-card');
            const input=el('input');
            input.type='radio';input.name='subject';input.value=item.zh;input.checked=i===0;
            const zh=el('strong',item.zh==='open'?'不限':item.zh);zh.lang='zh-Hans';
            label.append(input,zh,el('span',item.en));
            return label;
          }));
        }
        const hints={book:next.options.stage,article:'Various',dialogue:next.options.people+' people'};
        for(const input of storyType.querySelectorAll('input')){
          input.parentElement.querySelector('small').textContent=hints[input.value];
        }
        preview=next;
        progress.replaceChildren(readingProgress(next.level,next.projected,next));
        const previousIndex=reroll?[...cards.children].findIndex(card=>card.dataset.word===reroll):-1;
        cards.replaceChildren(...next.cards.map(item=>{
          const card=el('article',null,'focus-card');
          card.dataset.word=item.text;
          const state=focusState(item.color);
          const change=el('button','↻','focus-reroll');
          change.type='button';change.title='Reroll '+item.text;change.setAttribute('aria-label',change.title);
          change.onclick=()=>refresh(item.text);
          const hanzi=el('strong',item.text);hanzi.lang='zh-Hans';
          card.append(state,change,hanzi,el('span',item.pinyin??''),el('span',item.meaning??'','focus-meaning'),
            el('small','+'+item.gain+' est. '+(item.gain===1?'point':'points')));
          return card;
        }));
        focus.disabled=false;button.disabled=false;status.textContent='';
        if(previousIndex>=0)cards.children[previousIndex]?.querySelector('button')?.focus();
      }catch(error){
        if(signal.aborted||request!==revision)return;
        status.textContent=error.message+' ';
        const retry=el('button','Reload preview');retry.type='button';
        retry.onclick=()=>{preview=undefined;refresh();};
        status.append(retry);
        if(reroll){focus.disabled=false;button.disabled=false;}
      }
    }
    form.onchange=e=>{if(e.target.name!=='subject')refresh();};
    form.onsubmit=async e=>{
      e.preventDefault();
      if(button.disabled||!preview)return;
      const choices=new FormData(form);
      button.disabled=true;
      for(const group of form.querySelectorAll('fieldset'))group.disabled=true;
      status.textContent='Starting your story…';
      try{
        await api('/api/generate-story',{previewId:preview.id,subject:choices.get('subject'),minutes:Number(choices.get('minutes')),difficulty:choices.get('difficulty')});
        if(!signal.aborted)ui.navigate('home');
      }catch(error){
        status.textContent=error.message;
        button.disabled=false;
        for(const group of form.querySelectorAll('fieldset'))group.disabled=false;
      }
    };
    await refresh();
  });
  ui.route('introduction',async context=>{
    const {root,parts}=context;
    const {story,focus}=await api('/api/stories/'+encodeURIComponent(parts[0])+'?focus=1',undefined,context.signal);
    if(context.signal.aborted)return;
    let content=root;
    if(story.cover){
      const {center,aside,definition}=readerLayout(root,story,-1);
      const completion=await api('/api/stories/'+encodeURIComponent(story.id)+'/completion',undefined,context.signal);
      if(context.signal.aborted)return;
      markCompleted(root,completion.chapters);
      content=center;
      const heading=el('header',null,'chapter-heading');
      heading.append(el('p','Introduction','overline'),el('h1',story.title));
      center.append(heading);
      const article=readingText([story.cover.tokens]);
      showCover({...context,root:center},story,article);
      await ui.emit('cover-reader',{...context,story,article,aside,definition,position:{chapter:-1},onStrengthChange(text,color){
        const card=root.querySelector('.cover-focus [data-word-card="'+CSS.escape(text)+'"]');
        card?.querySelector('.focus-state')?.replaceWith(focusState(color));
      }});
    }else root.append(el('h1',story.title));
    if(focus.length){
      const list=el('ul',null,'focus-cards cover-focus');
      for(const item of focus){
        const card=el('li',null,'focus-card');
        card.dataset.wordCard=item.text;
        const hanzi=el('strong',item.text);hanzi.lang='zh-Hans';
        card.append(focusState(item.color),hanzi,el('span',item.pinyin),el('span',item.meaning,'focus-meaning'));
        if(item.example && item.example!==item.text)card.append(el('small','In '+item.example));
        list.append(card);
      }
      content.append(el('h2','Character focus'),list);
    }
    if(!story.cover)root.append(link('Begin reading','#/read/'+encodeURIComponent(story.id),'button'));
  });
}

function focusState(color){
  const labels={gray:'Unseen',red:'Struggling',yellow:'Learning',green:'Strong',gold:'Perfect'};
  const state=el('span',labels[color],'focus-state');
  state.dataset.color=color;
  return state;
}

function choiceGroup(legend,name,selected,options) {
  const group=el('fieldset');
  const cards=el('div',null,'choice-grid');
  for(const {value,label=title(value),symbol,disabled=false} of options) {
    const card=el('label',null,'choice-card');
    const input=el('input');
    input.type='radio';
    input.name=name;
    input.value=value;
    input.checked=value===selected;
    input.disabled=disabled;
    const check=el('span','✓','choice-check');
    check.setAttribute('aria-hidden','true');
    const caption=el('span',label);
    if(name==='storyType')caption.append(el('small',null,'reading-subtype'));
    card.append(input,icon(symbol),caption,check);
    cards.append(card);
  }
  group.append(el('legend',legend),cards);
  return group;
}
