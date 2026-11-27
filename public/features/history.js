import {readingProgress} from '../reading-progress.js';
import {coverImage} from './art.js';
export function setup(ui) {
  const {el,link,api}=ui;
  const read=story=>'#/read/'+encodeURIComponent(story.id);
  function metadata(story){
    const difficulty=story.difficulty;
    const level=story.hskLevel?'HSK '+story.hskLevel:null;
    return el('span',[level,difficulty?difficulty[0].toUpperCase()+difficulty.slice(1):'Difficulty unrecorded'].filter(Boolean).join(' · '),'story-metadata');
  }
  function statusBadge(story){
    const state=story.finished?'finished':story.opened?'reading':'new';
    const badge=el('span',{finished:'Finished',reading:'In progress',new:'Not started'}[state],'gallery-status '+state);
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
  function listing(stories,manage=false) {
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
            if(!list.children.length)list.append(el('li','No stories yet.','empty-shelf'));
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
  async function watchShelf(list,context,manage){
    const {signal,onLeave}=context;
    const steps=['planning','writing','checking','questions','saving'];
    const labels={planning:'Planning vocabulary',writing:'Writing chapters',checking:'Checking vocabulary',revising:'Revising chapters',questions:'Preparing questions',saving:'Saving story'};
    let timer,previous,card;
    onLeave(()=>clearTimeout(timer));
    async function poll(){
      if(signal.aborted)return;
      let delay=10000;
      try{
        const job=await api('/api/generation-job',undefined,signal);
        if(signal.aborted)return;
        const snapshot=JSON.stringify(job);
        if(job && job.stage!=='failed' && job.stage!=='ready')delay=1500;
        if(snapshot!==previous){
          if(job && job.stage!=='ready'){
            if(!card){
              card=el('li',null,'draft-story');
              const image=el('img',null,'draft-art');image.alt='';image.src='/baobao.png';
              card.append(image,el('div',null,'draft-copy'));list.prepend(card);
            }
            const failed=job.stage==='failed',copy=card.lastChild;
            copy.replaceChildren(el('strong',failed?'Generation stopped':'Still generating'),metadata(job));
            if(failed)copy.append(el('span',[labels[job.failedStage],job.error].filter(Boolean).join(' · ')),link('Try again in Generate','#/practice','text-link'),link('Open Settings','#/settings','text-link'));
            else{
              const progress=el('progress');progress.max=steps.length;
              progress.value=steps.indexOf(job.stage==='revising'?'checking':job.stage);
              progress.setAttribute('aria-label','Story generation progress');
              copy.append(progress,el('span',job.detail??labels[job.stage]));
            }
          }else if(card || (job?.storyId && !list.querySelector('[data-story-id="'+CSS.escape(job.storyId)+'"]'))){
            const {stories}=await api('/api/history',undefined,signal);
            if(signal.aborted)return;
            const fresh=listing(manage?stories:stories.slice(0,4),manage);
            list.replaceWith(fresh);list=fresh;card=undefined;
          }
          previous=snapshot;
        }
      }catch(error){if(signal.aborted)return;delay=3000;}
      timer=setTimeout(poll,delay);
    }
    await poll();
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
      copy.append(el('h2','Your next story'),link('Create a story →','#/practice','button'));
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
    await watchShelf(list,context,false);
  });
  ui.route('stories',async context=>{
    const {root,signal}=context;
    const {stories}=await api('/api/history',undefined,signal);
    if(signal.aborted)return;
    const list=listing(stories,true);
    root.append(link('← Reading desk','#/home','text-link'),el('h1','Your stories'),list);
    await watchShelf(list,context,true);
  });
  ui.on('reader-ready',async({story,signal,onLeave})=>{
    if(signal.aborted)return;
    const opened=api('/api/stories/'+encodeURIComponent(story.id)+'/opened',{});
    onLeave(()=>opened);
    await opened;
  });
}
