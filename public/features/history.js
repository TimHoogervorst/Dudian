export function setup(ui) {
  const {el,link,api}=ui;
  const read=story=>'#/read/'+encodeURIComponent(story.id);
  function listing(stories) {
    const list=el('ul',null,'story-shelf');
    for(const story of stories) {
      const item=el('li');
      const a=link('',read(story),'shelf-item');
      if(story.id==='tea-shop') {
        const art=el('span',null,'tea-art shelf-art');
        a.append(art);
      }
      const copy=el('span',null,'shelf-copy');
      copy.append(el('strong',story.title),el('span',story.finished?'Finished':'In progress','story-state'));
      a.append(copy,el('span','→','shelf-arrow'));
      item.append(a);list.append(item);
    }
    return list;
  }
  ui.route('home',async({root})=>{
    const {stories,current}=await api('/api/history');
    const featured=current??stories.find(s=>!s.finished);
    const heading=el('header',null,'page-heading');
    heading.append(el('h1','Your reading week'));
    const overview=el('div',null,'dashboard-overview');
    const hero=el('section',null,'home-hero');
    if(featured?.id==='tea-shop'){
      const art=el('div',null,'tea-art');art.setAttribute('role','img');
      art.setAttribute('aria-label','A rainy afternoon at the tea shop');hero.append(art);
    }
    const copy=el('div',null,'hero-copy');
    if(featured) {
      copy.append(el('p','Chapter '+(featured.chapter+1)+' of '+featured.chapterCount,'overline'));
      const titles=el('div');
      titles.append(el('h2',featured.title),el('p',featured.chapterTitle,'hero-chapter'));
      copy.append(titles,link(current?'Continue reading →':'Start reading →',read(featured),'button'));
    }else{
      copy.append(el('h2','Your next story'),link('Start reading →','#/reading','button'));
    }
    hero.append(copy);
    overview.append(hero,el('div',null,'home-week'));
    const shelf=el('section');
    const bar=el('header',null,'shelf-heading');
    bar.append(el('h2','Recent stories'),link('See all →','#/stories','text-link'));
    shelf.append(bar,listing(stories.slice(0,4)));root.append(heading,overview,shelf);
  });
  ui.route('stories',async({root})=>{
    const {stories}=await api('/api/history');
    root.append(link('← Reading desk','#/home','text-link'),el('h1','Your stories'),listing(stories));
  });
  ui.on('reader',async({story})=>{
    await api('/api/stories/'+encodeURIComponent(story.id)+'/opened',{});
  });
}
