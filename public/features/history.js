import {readingProgress} from '../reading-progress.js';
import {coverImage} from './art.js';
import {matchesStory,storySearch,storyStatus,storyStatuses} from '../story-search.js';
export function setup(ui) {
  const {el,link,api}=ui;
  const read=story=>'#/read/'+encodeURIComponent(story.id);
  function metadata(story){
    const difficulty=story.difficulty;
    const level=story.hskLevel?'HSK '+story.hskLevel:null;
    return el('span',[level,difficulty?difficulty[0].toUpperCase()+difficulty.slice(1):'Difficulty unrecorded'].filter(Boolean).join(' · '),'story-metadata');
  }
  function statusBadge(story){
    const state=storyStatus(story);
    const badge=el('span',storyStatuses[state],'gallery-status '+state);
    const symbol=el('span',state==='finished'?'✓':'','gallery-status-icon');
    symbol.setAttribute('aria-hidden','true');badge.prepend(symbol);
    return badge;
  }
  function cardArtwork(story,featured=false){
    const frame=el('span',null,'card-artwork');
    const artClass=featured?'hero-art':'shelf-art';
    let art;
    if(story?.hasCover)art=coverImage(story,artClass);
    else if(story?.id==='tea-shop')art=el('span',null,'tea-art '+artClass);
    else{
      art=el('img',null,artClass);
      art.src='/baobao.png';art.alt='';
    }
    art.setAttribute('aria-hidden','true');
    frame.append(art);
    if(story)frame.append(statusBadge(story));
    return frame;
  }
  function listing(stories,manage=false,onHide) {
    const list=el('ul',null,'story-shelf');
    for(const story of stories) {
      const item=el('li');
      item.dataset.storyId=story.id;
      const href=story.hasCover?'#/introduction/'+encodeURIComponent(story.id):read(story);
      const cover=cardArtwork(story);
      list.append(item);
      if(manage){
        item.className='managed-story';
        const title=el('h2');
        const storyLink=link('',href,'gallery-story-link');
        storyLink.append(el('span',story.title,'shelf-title'));
        title.append(storyLink);
        const copy=el('div',null,'shelf-copy');
        copy.append(title,metadata(story));
        const strong=(story.focus??[]).filter(entry=>entry.strong && /^\p{Script=Han}$/u.test(entry.text));
        if(strong.length){
          const preview=el('div',null,'story-focus-preview');
          preview.append(el('small','Strong focus'));
          const characters=el('div',null,'story-focus-characters');
          for(const entry of strong.slice(0,3)){
            const label=el('span');
            const hanzi=el('b',entry.text);
            hanzi.lang='zh-Hans';
            label.append(hanzi,' '+(entry.pinyin??''));
            characters.append(label);
          }
          if(strong.length>3)characters.append(el('span','+'+(strong.length-3)));
          preview.append(characters);
          copy.append(preview);
        }
        item.append(cover,copy);
        const menu=el('details',null,'story-menu');
        menu.name='story-actions';
        const toggle=el('summary','•••');
        toggle.setAttribute('aria-label','Actions for '+story.title);
        const remove=el('button','Delete story');
        remove.onclick=async()=>{
          if(!window.confirm('Hide “'+story.title+'” from your stories? Your learning progress will be kept.'))return;
          remove.disabled=true;
          try{
            await api('/api/stories/'+encodeURIComponent(story.id)+'/hide',{});
            const next=item.nextElementSibling??item.previousElementSibling;
            item.remove();
            onHide?.(story.id);
            next?.querySelector('summary')?.focus();
          }catch(error){ui.notice(error.message);remove.disabled=false;}
        };
        menu.onkeydown=e=>{if(e.key==='Escape'){menu.open=false;toggle.focus();}};
        menu.append(toggle,remove);item.append(menu);
      }else{
        const a=link('',href,'shelf-item');
        const copy=el('span',null,'shelf-copy');
        copy.append(el('strong',story.title,'shelf-title'),metadata(story));
        a.append(cover,copy);
        item.append(a);
      }
    }
    if(!stories.length)list.append(el('li','No stories yet.','empty-shelf'));
    return list;
  }
  ui.route('home',async context=>{
    const {root,signal}=context;
    const [{stories,current},progress]=await Promise.all([api('/api/history',undefined,signal),api('/api/reading-progress',undefined,signal)]);
    if(signal.aborted)return;
    const featured=current;
    const overview=el('div',null,'dashboard-overview');
    const hero=el('section',null,'home-hero');
    hero.append(cardArtwork(featured,true));
    const copy=el('div',null,'hero-copy');
    if(featured) {
      copy.append(el('p','Chapter '+(featured.chapter+1)+' of '+featured.chapterCount,'overline'));
      const titles=el('div');
      titles.append(el('h2',featured.title),metadata(featured),el('p',featured.chapterTitle,'hero-chapter'));
      const actions=el('div',null,'hero-actions');
      actions.append(link('Continue reading →',read(featured),'button'));
      copy.append(titles,actions);
    }else{
      copy.append(el('h2','Your next story'),link('Browse stories →','#/stories','button'));
    }
    hero.append(copy);
    const stats=el('div',null,'dashboard-stats');
    stats.append(el('section',null,'home-week'),readingProgress(progress.level,undefined,progress));
    overview.append(hero,stats);
    const shelf=el('section');
    const bar=el('header',null,'shelf-heading');
    bar.append(el('h1','Your stories'),link('See all →','#/stories','text-link'));
    const list=listing(stories.slice(0,4));
    shelf.append(bar,list);root.append(overview,shelf);
  });
  ui.route('stories',async context=>{
    const {root,signal}=context;
    const {stories}=await api('/api/history?focus',undefined,signal);
    if(signal.aborted)return;
    let list,byId;
    const search=storySearch(root,context.parts,filter);
    function filter(){
      const filters=search.filters();
      let visible=0;
      for(const item of list.querySelectorAll('[data-story-id]')){
        item.hidden=!matchesStory(byId.get(item.dataset.storyId),filters);
        if(!item.hidden)visible++;
      }
      search.count.textContent=visible+(visible===1?' story':' stories');
      list.querySelector('.empty-shelf')?.remove();
      if(!visible)list.append(el('li',byId.size?'No stories match these filters.':'No stories yet.','empty-shelf'));
    }
    function refresh(stories){
      byId=new Map(stories.map(story=>[story.id,story]));
      list=listing(stories,true,id=>{byId.delete(id);filter();});
      filter();
      return list;
    }
    root.append(refresh(stories));
  });
  ui.on('reader-ready',async({story,signal,onLeave})=>{
    if(signal.aborted)return;
    const opened=api('/api/stories/'+encodeURIComponent(story.id)+'/opened',{});
    onLeave(()=>opened);
    await opened;
  });
}
