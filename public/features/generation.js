import {showCover} from './art.js';
import {addSpeaker} from '../reader-audio.js';
import {readerLayout,readingText,markCompleted} from '../reader-layout.js';
import {el} from '../ui.js';

export function setup(ui) {
  const {el,api,link}=ui;
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
      addSpeaker(article.firstElementChild,'Listen to introduction',[{text:story.cover.teaser}],context.signal);
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
